import { DuplicateIdempotencyKeyError } from '../domain/errors/duplicate-idempotency-key.error';
import { ReportPhotoSize } from '../domain/repositories/report-photo.repository';
import { GeoPoint } from '../domain/value-objects/geo-point';
import {
  InMemoryReportPhotoRepository,
  InMemoryReportRepository,
  InMemoryReportsDatabase,
} from './in-memory-reports';
import { buildPhoto, CENTER, JpegFixture, openTestReport, pointNorthOf } from './report-fixtures';

describe('Fakes dos reportes', () => {
  let database: InMemoryReportsDatabase;
  let reports: InMemoryReportRepository;
  let photos: InMemoryReportPhotoRepository;

  beforeEach(() => {
    database = new InMemoryReportsDatabase();
    reports = new InMemoryReportRepository(database);
    photos = new InMemoryReportPhotoRepository(database);
  });

  it('deve recusar a mesma Idempotency-Key do mesmo autor, como o UNIQUE do banco', async () => {
    await reports.create(openTestReport({ idempotencyKey: 'chave' }), buildPhoto());

    await expect(
      reports.create(openTestReport({ idempotencyKey: 'chave' }), buildPhoto()),
    ).rejects.toThrow(DuplicateIdempotencyKeyError);
    await expect(
      reports.create(openTestReport({ authorId: 'outro', idempotencyKey: 'chave' }), buildPhoto()),
    ).resolves.toBeUndefined();
  });

  it('deve medir a distância por haversine e ordenar do mais perto ao mais longe', async () => {
    const far = openTestReport({ location: pointNorthOf(CENTER, 300) });
    const near = openTestReport({ location: pointNorthOf(CENTER, 100) });
    await reports.create(far, buildPhoto());
    await reports.create(near, buildPhoto());

    const result = await reports.findNearby(GeoPoint.create(CENTER), 1000, 10);

    expect(result.map(({ report }) => report.id)).toEqual([near.id, far.id]);
    expect(result[0].distanceMeters).toBeCloseTo(near.location.distanceTo(GeoPoint.create(CENTER)));
  });

  it('deve trocar a foto ao salvar o reporte com uma foto nova', async () => {
    const report = openTestReport();
    await reports.create(report, buildPhoto());
    const photo = buildPhoto(JpegFixture.PROGRESSIVE);

    await reports.save(report, photo);

    await expect(photos.findContent(report.id, ReportPhotoSize.FULL)).resolves.toMatchObject({
      photoId: photo.id,
    });
  });

  it('deve devolver null para a foto de um reporte inexistente', async () => {
    await expect(photos.findContent('inexistente', ReportPhotoSize.THUMBNAIL)).resolves.toBeNull();
  });
});
