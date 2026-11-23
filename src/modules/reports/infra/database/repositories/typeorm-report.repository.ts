import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';

import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportPhoto } from '../../../domain/entities/report-photo.entity';
import { ReportVote } from '../../../domain/entities/report-vote.entity';
import { Report } from '../../../domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '../../../domain/errors/duplicate-idempotency-key.error';
import { DuplicateVoteError } from '../../../domain/errors/duplicate-vote.error';
import { ReportHasVotesError } from '../../../domain/errors/report-has-votes.error';
import { ReportNotDeletableError } from '../../../domain/errors/report-not-deletable.error';
import {
  NearbyReport,
  ReportFilter,
  ReportRepository,
} from '../../../domain/repositories/report.repository';
import { GeoPoint } from '../../../domain/value-objects/geo-point';
import { PUBLIC_REPORT_STATUSES, ReportStatus } from '../../../domain/value-objects/report-status';
import { ReportVoteType } from '../../../domain/value-objects/report-vote-type';
import { ReportPhotoOrmEntity } from '../entities/report-photo.orm-entity';
import { ReportVoteOrmEntity } from '../entities/report-vote.orm-entity';
import { ReportOrmEntity, WGS84_SRID } from '../entities/report.orm-entity';
import { ReportPhotoMapper } from '../mappers/report-photo.mapper';
import { ReportVoteMapper } from '../mappers/report-vote.mapper';
import { ReportMapper, ReportRowExtras } from '../mappers/report.mapper';

/** Colunas calculadas da consulta dos reportes, ao lado das da entidade (`report_<coluna>`). */
interface ReportRawRow extends ReportRowExtras {
  report_id: string;
  distance?: number;
}

/** Restrição que garante uma `Idempotency-Key` por autor (RN31). */
const IDEMPOTENCY_KEY_CONSTRAINT = 'uq_reports_idempotency_key_author_id';
/** Restrição que garante um voto por usuário e reporte (RN37). */
const VOTE_CONSTRAINT = 'uq_report_votes_report_id_user_id';

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
 *
 * As colunas da validação (o status e as contagens) só são gravadas pelo `vote`, com a linha do
 * reporte travada. A edição e a exclusão só gravam se o reporte continua como estava quando foi
 * lido, para um voto simultâneo não ser desfeito nem ignorado.
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
      throw isUniqueViolation(error, IDEMPOTENCY_KEY_CONSTRAINT)
        ? new DuplicateIdempotencyKeyError()
        : error;
    }
  }

  async save(report: Report, photo?: ReportPhoto): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      // Só grava se o reporte continua em validação e sem votos (RN33): um voto gravado depois
      // da leitura deixa a condição falsa, e a edição é recusada.
      const { affected } = await manager.update(
        ReportOrmEntity,
        {
          id: report.id,
          status: ReportStatus.PENDING,
          confirmationsCount: 0,
          rejectionsCount: 0,
        },
        ReportMapper.toEditChanges(report),
      );
      if (!affected) {
        throw new ReportHasVotesError();
      }

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
    // Só exclui o reporte que continua em validação (RN34): um voto que o confirmou ou descartou
    // depois da leitura deixa a condição falsa.
    const { affected } = await this.repository.update(
      { id: report.id, status: ReportStatus.PENDING },
      { deletedAt: report.deletedAt, updatedAt: report.updatedAt },
    );
    if (!affected) {
      throw new ReportNotDeletableError();
    }
  }

  async vote(reportId: string, apply: (report: Report) => ReportVote): Promise<Report | null> {
    try {
      return await this.repository.manager.transaction(async (manager) => {
        // A trava vale até o fim da transação: o voto seguinte no mesmo reporte lê as contagens
        // já com este voto.
        const [locked] = await this.load(
          this.selectReports(manager.getRepository(ReportOrmEntity))
            .where('report.id = :id', { id: reportId })
            .setLock('pessimistic_write'),
        );
        if (!locked) {
          return null;
        }

        const { report } = locked;
        const vote = apply(report);
        await manager.insert(ReportVoteOrmEntity, ReportVoteMapper.toPersistence(vote));
        await manager.update(
          ReportOrmEntity,
          { id: report.id },
          ReportMapper.toVotingChanges(report),
        );

        return report;
      });
    } catch (error) {
      throw isUniqueViolation(error, VOTE_CONSTRAINT) ? new DuplicateVoteError() : error;
    }
  }

  async findVotes(voterId: string, reportIds: string[]): Promise<Map<string, ReportVoteType>> {
    if (reportIds.length === 0) {
      return new Map();
    }

    const votes = await this.repository.manager.getRepository(ReportVoteOrmEntity).find({
      select: { reportId: true, vote: true },
      where: { userId: voterId, reportId: In(reportIds) },
    });

    return new Map(votes.map(({ reportId, vote }) => [reportId, vote]));
  }

  /**
   * Reporte com a localização e os dados da foto, sem as imagens. O `repository` é o da
   * transação, quando a consulta faz parte de uma.
   */
  private selectReports(
    repository: Repository<ReportOrmEntity> = this.repository,
  ): SelectQueryBuilder<ReportOrmEntity> {
    return repository
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
 * Se o erro é o do índice UNIQUE informado. É ele que barra a `Idempotency-Key` de dois pedidos
 * simultâneos, que passam juntos pela busca do caso de uso, e o voto repetido.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const { code, sqlMessage } = error.driverError as { code?: string; sqlMessage?: string };

  return code === 'ER_DUP_ENTRY' && (sqlMessage?.includes(constraint) ?? false);
}
