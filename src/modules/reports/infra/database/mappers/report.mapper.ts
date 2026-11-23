import { Report } from '../../../domain/entities/report.entity';
import { GeoLocation } from '../../../domain/value-objects/geo-location';
import { GeoPoint } from '../../../domain/value-objects/geo-point';
import { ReportDescription } from '../../../domain/value-objects/report-description';
import { ReportOrmEntity } from '../entities/report.orm-entity';

/**
 * Colunas que a consulta do repositório lê junto com o reporte: a localização, pelas funções
 * espaciais, e os dados da foto, da tabela `report_photos`.
 */
export interface ReportRowExtras {
  latitude: number;
  longitude: number;
  photoId: string;
  photoWidth: number;
  photoHeight: number;
}

/** Colunas que a edição do autor muda (RN33). A localização e o autor não mudam. */
export type ReportEditChanges = Pick<ReportOrmEntity, 'description' | 'updatedAt'>;

/** Colunas que um voto muda (RN39 e RN40). */
export type ReportVotingChanges = Pick<
  ReportOrmEntity,
  'status' | 'confirmationsCount' | 'rejectionsCount' | 'statusChangedAt' | 'updatedAt'
>;

export class ReportMapper {
  static toDomain(entity: ReportOrmEntity, extras: ReportRowExtras): Report {
    return Report.restore(entity.id, {
      authorId: entity.authorId,
      status: entity.status,
      description:
        entity.description === null ? null : ReportDescription.create(entity.description),
      location: GeoLocation.create({
        latitude: extras.latitude,
        longitude: extras.longitude,
        accuracyMeters: entity.accuracyMeters,
      }),
      photo: { id: extras.photoId, width: extras.photoWidth, height: extras.photoHeight },
      confirmationsCount: entity.confirmationsCount,
      rejectionsCount: entity.rejectionsCount,
      idempotencyKey: entity.idempotencyKey,
      statusChangedAt: entity.statusChangedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }

  /** Todas as colunas, menos a localização, que o repositório grava pela função espacial. */
  static toPersistence(report: Report): ReportOrmEntity {
    const entity = new ReportOrmEntity();
    entity.id = report.id;
    entity.authorId = report.authorId;
    entity.accuracyMeters = report.location.accuracyMeters;
    entity.idempotencyKey = report.idempotencyKey;
    entity.createdAt = report.createdAt;
    entity.deletedAt = report.deletedAt;
    Object.assign(entity, ReportMapper.toEditChanges(report), ReportMapper.toVotingChanges(report));

    return entity;
  }

  /**
   * Só a edição: as colunas da validação ficam de fora, para uma edição feita ao mesmo tempo que
   * um voto não desfazer a contagem que o voto gravou.
   */
  static toEditChanges(report: Report): ReportEditChanges {
    return {
      description: report.description?.value ?? null,
      updatedAt: report.updatedAt,
    };
  }

  static toVotingChanges(report: Report): ReportVotingChanges {
    return {
      status: report.status,
      confirmationsCount: report.confirmationsCount,
      rejectionsCount: report.rejectionsCount,
      statusChangedAt: report.statusChangedAt,
      updatedAt: report.updatedAt,
    };
  }

  /**
   * WKT do ponto na ordem longitude-latitude, a do GeoJSON. O repositório o lê com
   * `'axis-order=long-lat'`: no SRID 4326, a ordem padrão do MySQL é a inversa.
   */
  static toWkt(point: GeoPoint): string {
    return `POINT(${point.longitude} ${point.latitude})`;
  }
}
