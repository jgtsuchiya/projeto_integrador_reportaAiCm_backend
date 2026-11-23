import { ReportVote } from '../domain/entities/report-vote.entity';
import { Report } from '../domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '../domain/errors/duplicate-idempotency-key.error';
import { DuplicateVoteError } from '../domain/errors/duplicate-vote.error';
import { OwnReportVoteError } from '../domain/errors/own-report-vote.error';
import { ReportPhotoSize } from '../domain/repositories/report-photo.repository';
import { GeoPoint } from '../domain/value-objects/geo-point';
import { ReportVoteType } from '../domain/value-objects/report-vote-type';
import {
  InMemoryReportPhotoRepository,
  InMemoryReportRepository,
  InMemoryReportsDatabase,
} from './in-memory-reports';
import {
  buildPhoto,
  CENTER,
  JpegFixture,
  openTestReport,
  pointNorthOf,
  TEST_REPORTS_CONFIG,
} from './report-fixtures';

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

  describe('votos', () => {
    /** A regra da entidade, como o `VoteOnReportUseCase` a entrega ao repositório. */
    function confirm(voterId: string): (report: Report) => ReportVote {
      return (report) => report.registerVote(voterId, ReportVoteType.CONFIRM, TEST_REPORTS_CONFIG);
    }

    it('deve gravar o voto e trocar o reporte guardado por uma cópia atualizada', async () => {
      const report = openTestReport();
      await reports.create(report, buildPhoto());

      const updated = await reports.vote(report.id, confirm('voter-1'));

      expect(updated).not.toBe(report);
      expect(updated?.confirmationsCount).toBe(1);
      expect(report.confirmationsCount).toBe(0);
      expect(database.reports.get(report.id)).toBe(updated);
      await expect(reports.findVotes('voter-1', [report.id, 'outro'])).resolves.toEqual(
        new Map([[report.id, ReportVoteType.CONFIRM]]),
      );
    });

    it('deve recusar o voto repetido e o da regra, sem gravar nada', async () => {
      const report = openTestReport({ authorId: 'author-1' });
      await reports.create(report, buildPhoto());
      await reports.vote(report.id, confirm('voter-1'));

      await expect(reports.vote(report.id, confirm('voter-1'))).rejects.toThrow(DuplicateVoteError);
      await expect(reports.vote(report.id, confirm('author-1'))).rejects.toThrow(
        OwnReportVoteError,
      );
      expect(database.votes).toHaveLength(1);
      expect(database.reports.get(report.id)?.confirmationsCount).toBe(1);
    });

    it('deve devolver null para o reporte inexistente ou excluído', async () => {
      const report = openTestReport({ authorId: 'author-1' });
      await reports.create(report, buildPhoto());
      report.delete('author-1');

      await expect(reports.vote(report.id, confirm('voter-1'))).resolves.toBeNull();
      await expect(reports.vote('inexistente', confirm('voter-1'))).resolves.toBeNull();
    });
  });
});
