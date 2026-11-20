import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';

import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportPhoto } from '../../../domain/entities/report-photo.entity';
import { Report } from '../../../domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '../../../domain/errors/duplicate-idempotency-key.error';
import {
  NearbyReport,
  ReportFilter,
  ReportRepository,
} from '../../../domain/repositories/report.repository';
import { GeoPoint } from '../../../domain/value-objects/geo-point';
import { PUBLIC_REPORT_STATUSES } from '../../../domain/value-objects/report-status';
import { ReportPhotoOrmEntity } from '../entities/report-photo.orm-entity';
import { ReportOrmEntity, WGS84_SRID } from '../entities/report.orm-entity';
import { ReportPhotoMapper } from '../mappers/report-photo.mapper';
import { ReportMapper, ReportRowExtras } from '../mappers/report.mapper';

/** Colunas calculadas da consulta dos reportes, ao lado das da entidade (`report_<coluna>`). */
interface ReportRawRow extends ReportRowExtras {
  report_id: string;
  distance?: number;
}

/** Restrição que garante uma `Idempotency-Key` por autor (RN31). */
const IDEMPOTENCY_KEY_CONSTRAINT = 'uq_reports_idempotency_key_author_id';

/** Menor distância de um grau de latitude, no equador, em metros. */
const MIN_METERS_PER_LATITUDE_DEGREE = 110_574;
/** Distância de um grau de longitude no equador, em metros. */
const METERS_PER_LONGITUDE_DEGREE_AT_EQUATOR = 111_320;
/** Folga do retângulo da busca, para os arredondamentos nunca deixarem um reporte de fora. */
const BOX_MARGIN = 1.01;

/**
 * Geometria lida de um parâmetro em WKT, na ordem longitude-latitude. No SRID 4326, a ordem
 * padrão do MySQL é latitude-longitude, ao contrário do GeoJSON e da maioria das bibliotecas.
 */
function geometryFromWkt(parameter: string): string {
  return `ST_GeomFromText(:${parameter}, ${WGS84_SRID}, 'axis-order=long-lat')`;
}

/**
 * Persistência dos reportes. A coluna `location` é `POINT SRID 4326`: ela é gravada pelo
 * `ST_GeomFromText` com a ordem dos eixos explícita e lida pelo `ST_Latitude()` e pelo
 * `ST_Longitude()`, nunca pelo `ST_X()` e pelo `ST_Y()`, que seguem a ordem do SRID.
 *
 * As consultas juntam o id e as dimensões da foto, mas nunca as imagens: as colunas delas usam
 * `select: false`. As consultas do TypeORM ignoram os reportes excluídos (`@DeleteDateColumn`).
 */
@Injectable()
export class TypeOrmReportRepository implements ReportRepository {
  constructor(
    @InjectRepository(ReportOrmEntity)
    private readonly repository: Repository<ReportOrmEntity>,
  ) {}

  async create(report: Report, photo: ReportPhoto): Promise<void> {
    try {
      await this.repository.manager.transaction(async (manager) => {
        // A foto referencia o reporte (FK), então o reporte é gravado primeiro.
        await manager
          .createQueryBuilder()
          .insert()
          .into(ReportOrmEntity)
          .values({
            ...ReportMapper.toPersistence(report),
            location: () => geometryFromWkt('location'),
          })
          .setParameter('location', ReportMapper.toWkt(report.location.point))
          .updateEntity(false)
          .execute();
        await manager.insert(
          ReportPhotoOrmEntity,
          ReportPhotoMapper.toPersistence(photo, report.id),
        );
      });
    } catch (error) {
      throw isDuplicateIdempotencyKey(error) ? new DuplicateIdempotencyKeyError() : error;
    }
  }

  async save(report: Report, photo?: ReportPhoto): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager.update(ReportOrmEntity, { id: report.id }, ReportMapper.toChanges(report));

      if (photo) {
        await manager.delete(ReportPhotoOrmEntity, { reportId: report.id });
        await manager.insert(
          ReportPhotoOrmEntity,
          ReportPhotoMapper.toPersistence(photo, report.id),
        );
      }
    });
  }

  async findById(id: string): Promise<Report | null> {
    const [report] = await this.load(this.selectReports().where('report.id = :id', { id }));

    return report?.report ?? null;
  }

  async findByIdempotencyKey(authorId: string, idempotencyKey: string): Promise<Report | null> {
    const [report] = await this.load(
      this.selectReports()
        .withDeleted()
        .where('report.authorId = :authorId', { authorId })
        .andWhere('report.idempotencyKey = :idempotencyKey', { idempotencyKey }),
    );

    return report?.report ?? null;
  }

  async findByAuthor(
    authorId: string,
    { page, pageSize }: PageRequest,
    filter: ReportFilter,
  ): Promise<Page<Report>> {
    const query = this.selectReports().where('report.authorId = :authorId', { authorId });
    if (filter.status) {
      query.andWhere('report.status = :status', { status: filter.status });
    }

    const [rows, total] = await Promise.all([
      this.load(
        query
          .clone()
          // O id desempata os reportes do mesmo milissegundo, para a paginação ser estável.
          .orderBy('report.createdAt', 'DESC')
          .addOrderBy('report.id', 'ASC')
          .offset((page - 1) * pageSize)
          .limit(pageSize),
      ),
      query.getCount(),
    ]);

    return { items: rows.map(({ report }) => report), page, pageSize, total };
  }

  /**
   * Busca em duas etapas: o retângulo em volta do ponto (`MBRContains`), que usa o índice
   * espacial, e a distância exata, que o MySQL calcula em metros no elipsoide do WGS 84.
   */
  async findNearby(center: GeoPoint, radiusMeters: number, limit: number): Promise<NearbyReport[]> {
    const distance = `ST_Distance(report.location, ${geometryFromWkt('center')})`;
    const query = this.selectReports()
      .addSelect(distance, 'distance')
      .where('report.status IN (:...statuses)', { statuses: PUBLIC_REPORT_STATUSES });

    const box = boundingBox(center, radiusMeters);
    if (box) {
      query.andWhere(`MBRContains(${geometryFromWkt('box')}, report.location)`, { box });
    }

    const rows = await this.load(
      query
        .andWhere(`${distance} <= :radius`, { radius: radiusMeters })
        .setParameter('center', ReportMapper.toWkt(center))
        .orderBy('distance', 'ASC')
        .addOrderBy('report.id', 'ASC')
        .limit(limit),
    );

    return rows.map(({ report, row }) => ({ report, distanceMeters: Number(row.distance) }));
  }

  async countCreatedSince(authorId: string, since: Date): Promise<number> {
    return this.repository.count({
      where: { authorId, createdAt: MoreThanOrEqual(since) },
      withDeleted: true,
    });
  }

  async softDelete(report: Report): Promise<void> {
    await this.repository.update(
      { id: report.id },
      { deletedAt: report.deletedAt, updatedAt: report.updatedAt },
    );
  }

  /** Reporte com a localização e os dados da foto, sem as imagens. */
  private selectReports(): SelectQueryBuilder<ReportOrmEntity> {
    return this.repository
      .createQueryBuilder('report')
      .innerJoin(ReportPhotoOrmEntity, 'photo', 'photo.reportId = report.id')
      .addSelect('ST_Latitude(report.location)', 'latitude')
      .addSelect('ST_Longitude(report.location)', 'longitude')
      .addSelect('photo.id', 'photoId')
      .addSelect('photo.width', 'photoWidth')
      .addSelect('photo.height', 'photoHeight');
  }

  private async load(
    query: SelectQueryBuilder<ReportOrmEntity>,
  ): Promise<Array<{ report: Report; row: ReportRawRow }>> {
    const { entities, raw } = await query.getRawAndEntities<ReportRawRow>();
    const rows = new Map(raw.map((row) => [row.report_id, row]));

    return entities.map((entity) => {
      const row = rows.get(entity.id) as ReportRawRow;

      return { report: ReportMapper.toDomain(entity, row), row };
    });
  }
}

/**
 * Retângulo em volta do ponto que contém o círculo do raio, em WKT na ordem longitude-latitude.
 * Devolve `null` quando ele passaria de um polo ou do antimeridiano: aí a busca fica só com a
 * distância, sem o índice. Os reportes ficam todos na área atendida, longe desses lugares.
 */
function boundingBox(center: GeoPoint, radiusMeters: number): string | null {
  const deltaLatitude = (radiusMeters / MIN_METERS_PER_LATITUDE_DEGREE) * BOX_MARGIN;
  const minLatitude = center.latitude - deltaLatitude;
  const maxLatitude = center.latitude + deltaLatitude;
  if (minLatitude < -90 || maxLatitude > 90) {
    return null;
  }

  // O grau de longitude encolhe longe do equador: vale o da latitude mais distante dele.
  const farthestLatitude = Math.max(Math.abs(minLatitude), Math.abs(maxLatitude));
  const metersPerLongitudeDegree =
    METERS_PER_LONGITUDE_DEGREE_AT_EQUATOR * Math.cos((farthestLatitude * Math.PI) / 180);
  const deltaLongitude = (radiusMeters / metersPerLongitudeDegree) * BOX_MARGIN;
  const minLongitude = center.longitude - deltaLongitude;
  const maxLongitude = center.longitude + deltaLongitude;
  if (minLongitude < -180 || maxLongitude > 180) {
    return null;
  }

  const ring = [
    [minLongitude, minLatitude],
    [maxLongitude, minLatitude],
    [maxLongitude, maxLatitude],
    [minLongitude, maxLatitude],
    [minLongitude, minLatitude],
  ];

  return `POLYGON((${ring.map(([longitude, latitude]) => `${longitude} ${latitude}`).join(', ')}))`;
}

/**
 * O caso de uso procura a chave antes de gravar, mas dois pedidos simultâneos podem passar pela
 * busca. Nesse caso, quem barra é o índice UNIQUE do MySQL.
 */
function isDuplicateIdempotencyKey(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const { code, sqlMessage } = error.driverError as { code?: string; sqlMessage?: string };

  return code === 'ER_DUP_ENTRY' && (sqlMessage?.includes(IDEMPOTENCY_KEY_CONSTRAINT) ?? false);
}
