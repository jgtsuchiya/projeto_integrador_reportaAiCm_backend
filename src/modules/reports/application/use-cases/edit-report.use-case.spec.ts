import { InvalidReportImageError } from '../../domain/errors/invalid-report-image.error';
import { ReportAuthorOnlyError } from '../../domain/errors/report-author-only.error';
import { ReportHasVotesError } from '../../domain/errors/report-has-votes.error';
import { ReportNotEditableError } from '../../domain/errors/report-not-editable.error';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { InMemoryReportRepository, InMemoryReportsDatabase } from '../../testing/in-memory-reports';
import {
  buildPhoto,
  JpegFixture,
  openTestReport,
  OtherFormatFixture,
  readFixture,
  TEST_REPORTS_CONFIG,
  withReportChanges,
} from '../../testing/report-fixtures';
import { EditReportUseCase } from './edit-report.use-case';

const AUTHOR = 'client-1';
const OTHER = 'client-2';

describe('EditReportUseCase', () => {
  let database: InMemoryReportsDatabase;
  let repository: InMemoryReportRepository;
  let sut: EditReportUseCase;

  beforeEach(() => {
    database = new InMemoryReportsDatabase();
    repository = new InMemoryReportRepository(database);
    sut = new EditReportUseCase(repository, TEST_REPORTS_CONFIG);
  });

  async function seed(changes = {}): Promise<string> {
    const photo = buildPhoto();
    const report = withReportChanges(
      openTestReport({ authorId: AUTHOR, photo, description: 'Antes' }),
      changes,
    );
    await repository.create(report, photo);

    return report.id;
  }

  const newPhoto = (): { content: Uint8Array; thumbnail: Uint8Array } => ({
    content: readFixture(JpegFixture.PROGRESSIVE),
    thumbnail: readFixture(JpegFixture.THUMBNAIL),
  });

  it('deve trocar só a descrição e manter a foto', async () => {
    const id = await seed();
    const photoId = database.photos.get(id)?.id;

    const result = await sut.execute({ reportId: id, userId: AUTHOR, description: ' Depois ' });

    expect(result).toMatchObject({ description: 'Depois', photo: { id: photoId } });
  });

  it('deve trocar só a foto, com outro id, e manter a descrição', async () => {
    const id = await seed();
    const previousPhotoId = database.photos.get(id)?.id;

    const result = await sut.execute({ reportId: id, userId: AUTHOR, photo: newPhoto() });

    expect(result).toMatchObject({ description: 'Antes', photo: { width: 200, height: 150 } });
    expect(result.photo.id).not.toBe(previousPhotoId);
    expect(database.photos.get(id)?.id).toBe(result.photo.id);
  });

  it.each(['', null])('deve apagar a descrição com %p', async (description) => {
    const id = await seed();

    const result = await sut.execute({ reportId: id, userId: AUTHOR, description });

    expect(result.description).toBeNull();
  });

  it('deve responder 403 a quem vê o reporte, mas não é o autor', async () => {
    const id = await seed();

    await expect(sut.execute({ reportId: id, userId: OTHER, description: 'x' })).rejects.toThrow(
      ReportAuthorOnlyError,
    );
  });

  it('deve responder 404 a quem não pode ver o reporte', async () => {
    const id = await seed({ status: ReportStatus.REJECTED });

    await expect(sut.execute({ reportId: id, userId: OTHER, description: 'x' })).rejects.toThrow(
      ReportNotFoundError,
    );
  });

  it('deve recusar a edição do reporte com um voto', async () => {
    const id = await seed({ confirmationsCount: 1 });

    await expect(sut.execute({ reportId: id, userId: AUTHOR, description: 'x' })).rejects.toThrow(
      ReportHasVotesError,
    );
  });

  it('deve recusar a edição do reporte fora de validação', async () => {
    const id = await seed({ status: ReportStatus.CONFIRMED });

    await expect(sut.execute({ reportId: id, userId: AUTHOR, photo: newPhoto() })).rejects.toThrow(
      ReportNotEditableError,
    );
  });

  it('deve recusar a foto inválida sem mudar a descrição enviada junto', async () => {
    const id = await seed();
    const photo = { ...newPhoto(), content: readFixture(OtherFormatFixture.WEBP) };

    await expect(
      sut.execute({ reportId: id, userId: AUTHOR, description: 'Depois', photo }),
    ).rejects.toThrow(InvalidReportImageError);
    expect(database.reports.get(id)?.description?.value).toBe('Antes');
  });
});
