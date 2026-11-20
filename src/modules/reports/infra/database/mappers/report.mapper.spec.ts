import { GeoPoint } from '../../../domain/value-objects/geo-point';
import { ReportStatus } from '../../../domain/value-objects/report-status';
import { openTestReport, withReportChanges } from '../../../testing/report-fixtures';
import { ReportOrmEntity } from '../entities/report.orm-entity';
import { ReportMapper } from './report.mapper';

describe('ReportMapper', () => {
  it('deve converter o reporte para a persistência, sem a localização', () => {
    const report = openTestReport({ authorId: 'author-1', idempotencyKey: 'chave-1' });

    const entity = ReportMapper.toPersistence(report);

    expect(entity).toBeInstanceOf(ReportOrmEntity);
    expect(entity).toEqual({
      id: report.id,
      authorId: 'author-1',
      status: ReportStatus.PENDING,
      description: 'Buraco na faixa da direita.',
      accuracyMeters: 9,
      confirmationsCount: 0,
      rejectionsCount: 0,
      idempotencyKey: 'chave-1',
      statusChangedAt: null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      deletedAt: null,
    });
    expect(entity.location).toBeUndefined();
  });

  it('deve listar só as colunas que mudam depois da abertura', () => {
    const report = withReportChanges(openTestReport({ description: '' }), {
      status: ReportStatus.CONFIRMED,
      confirmationsCount: 10,
      statusChangedAt: new Date('2026-11-10T12:00:00.000Z'),
    });

    expect(ReportMapper.toChanges(report)).toEqual({
      status: ReportStatus.CONFIRMED,
      description: null,
      confirmationsCount: 10,
      rejectionsCount: 0,
      statusChangedAt: new Date('2026-11-10T12:00:00.000Z'),
      updatedAt: report.updatedAt,
    });
  });

  it('deve reconstruir o reporte com a localização e os dados da foto lidos na consulta', () => {
    const report = openTestReport();
    const entity = ReportMapper.toPersistence(report);

    const result = ReportMapper.toDomain(entity, {
      latitude: report.location.latitude,
      longitude: report.location.longitude,
      photoId: report.photo.id,
      photoWidth: 160,
      photoHeight: 120,
    });

    expect(result.equals(report)).toBe(true);
    expect(result.location.equals(report.location)).toBe(true);
    expect(result).toMatchObject({
      authorId: report.authorId,
      status: report.status,
      photo: { id: report.photo.id, width: 160, height: 120 },
      createdAt: report.createdAt,
    });
    expect(result.description?.value).toBe('Buraco na faixa da direita.');
  });

  it('deve reconstruir o reporte sem descrição', () => {
    const entity = ReportMapper.toPersistence(openTestReport({ description: '' }));

    const result = ReportMapper.toDomain(entity, {
      latitude: -24,
      longitude: -52,
      photoId: 'photo-1',
      photoWidth: 1,
      photoHeight: 1,
    });

    expect(result.description).toBeNull();
  });

  it('deve escrever o WKT na ordem longitude-latitude', () => {
    const point = GeoPoint.create({ latitude: -24.045812, longitude: -52.378901 });

    expect(ReportMapper.toWkt(point)).toBe('POINT(-52.378901 -24.045812)');
  });
});
