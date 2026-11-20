import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportPhotoSize } from '../../domain/repositories/report-photo.repository';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { JPEG_MIME_TYPE } from '../../domain/value-objects/report-image';
import {
  InMemoryReportPhotoRepository,
  InMemoryReportRepository,
  InMemoryReportsDatabase,
} from '../../testing/in-memory-reports';
import {
  buildPhoto,
  JpegFixture,
  openTestReport,
  readFixture,
  withReportChanges,
} from '../../testing/report-fixtures';
import { GetReportPhotoUseCase } from './get-report-photo.use-case';

const AUTHOR = 'client-1';

describe('GetReportPhotoUseCase', () => {
  let database: InMemoryReportsDatabase;
  let repository: InMemoryReportRepository;
  let sut: GetReportPhotoUseCase;

  beforeEach(() => {
    database = new InMemoryReportsDatabase();
    repository = new InMemoryReportRepository(database);
    sut = new GetReportPhotoUseCase(repository, new InMemoryReportPhotoRepository(database));
  });

  async function seed(status: ReportStatus = ReportStatus.PENDING): Promise<{ id: string }> {
    const photo = buildPhoto();
    const report = withReportChanges(openTestReport({ authorId: AUTHOR, photo }), { status });
    await repository.create(report, photo);

    return { id: report.id };
  }

  it.each([
    [ReportPhotoSize.FULL, JpegFixture.PHOTO],
    [ReportPhotoSize.THUMBNAIL, JpegFixture.THUMBNAIL],
  ])('deve devolver a imagem %s, com o id da foto', async (size, fixture) => {
    const { id } = await seed();

    const result = await sut.execute({ reportId: id, userId: 'client-2', size });

    expect(result).toEqual({
      id: database.photos.get(id)?.id,
      mimeType: JPEG_MIME_TYPE,
      content: readFixture(fixture),
    });
  });

  it('deve responder 404 quando o usuário não pode ver o reporte', async () => {
    const { id } = await seed(ReportStatus.REJECTED);

    await expect(
      sut.execute({ reportId: id, userId: 'client-2', size: ReportPhotoSize.FULL }),
    ).rejects.toThrow(ReportNotFoundError);
  });

  it('deve responder 404 quando a foto sumiu entre as duas leituras', async () => {
    const { id } = await seed();
    database.photos.delete(id);

    await expect(
      sut.execute({ reportId: id, userId: AUTHOR, size: ReportPhotoSize.FULL }),
    ).rejects.toThrow(ReportNotFoundError);
  });
});
