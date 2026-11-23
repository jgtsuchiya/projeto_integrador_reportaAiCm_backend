import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportPhoto } from '../domain/entities/report-photo.entity';
import { ReportVote } from '../domain/entities/report-vote.entity';
import { Report } from '../domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '../domain/errors/duplicate-idempotency-key.error';
import { DuplicateVoteError } from '../domain/errors/duplicate-vote.error';
import { ReportHasVotesError } from '../domain/errors/report-has-votes.error';
import { ReportNotDeletableError } from '../domain/errors/report-not-deletable.error';
import {
  ReportPhotoContent,
  ReportPhotoRepository,
  ReportPhotoSize,
} from '../domain/repositories/report-photo.repository';
import {
  NearbyReport,
  ReportFilter,
  ReportRepository,
} from '../domain/repositories/report.repository';
import { GeoPoint } from '../domain/value-objects/geo-point';
import { PUBLIC_REPORT_STATUSES, ReportStatus } from '../domain/value-objects/report-status';
import { ReportVoteType } from '../domain/value-objects/report-vote-type';
import { withReportChanges } from './report-fixtures';

/**
 * Fakes do módulo reports para os testes de caso de uso. Os repositórios compartilham um
 * `InMemoryReportsDatabase`, como as tabelas do MySQL. A distância é calculada por haversine
 * (`GeoPoint.distanceTo`), na esfera: o MySQL calcula no elipsoide, e os dois diferem em menos
 * de 0,5%.
 *
 * As entidades são guardadas por referência: uma alteração feita pelo caso de uso aparece no
 * "banco" mesmo sem ser gravada. A exceção é o voto, que troca o reporte guardado por uma cópia
 * atualizada, como a transação do MySQL: quem leu o reporte antes fica com a versão anterior,
 * o que permite testar a edição e a exclusão que perdem a corrida para um voto. As gravações
 * simultâneas de verdade são testadas contra o MySQL.
 */
export class InMemoryReportsDatabase {
  readonly reports = new Map<string, Report>();
  /** Fotos pelo id do reporte, uma por reporte, como o UNIQUE de `report_photos`. */
  readonly photos = new Map<string, ReportPhoto>();
  /** Um por usuário e reporte, como o UNIQUE de `report_votes`. */
  readonly votes: ReportVote[] = [];
}

export class InMemoryReportRepository extends ReportRepository {
  constructor(private readonly database: InMemoryReportsDatabase) {
    super();
  }

  async create(report: Report, photo: ReportPhoto): Promise<void> {
    const key = report.idempotencyKey;
    const reports = [...this.database.reports.values()];
    if (key && reports.some((r) => r.authorId === report.authorId && r.idempotencyKey === key)) {
      throw new DuplicateIdempotencyKeyError();
    }

    this.database.reports.set(report.id, report);
    this.database.photos.set(report.id, photo);
  }

  async save(report: Report, photo?: ReportPhoto): Promise<void> {
    // Como a gravação condicional do MySQL: um voto gravado depois da leitura recusa a edição.
    const stored = this.database.reports.get(report.id);
    if (stored && (stored.hasVotes || stored.status !== ReportStatus.PENDING)) {
      throw new ReportHasVotesError();
    }

    this.database.reports.set(report.id, report);
    if (photo) {
      this.database.photos.set(report.id, photo);
    }
  }

  async findById(id: string): Promise<Report | null> {
    const report = this.database.reports.get(id);

    return report && !report.isDeleted ? report : null;
  }

  async findByIdempotencyKey(authorId: string, idempotencyKey: string): Promise<Report | null> {
    const reports = [...this.database.reports.values()];

    return (
      reports.find((r) => r.authorId === authorId && r.idempotencyKey === idempotencyKey) ?? null
    );
  }

  async findByAuthor(
    authorId: string,
    { page, pageSize }: PageRequest,
    filter: ReportFilter,
  ): Promise<Page<Report>> {
    const reports = this.activeReports()
      .filter((report) => report.authorId === authorId)
      .filter((report) => !filter.status || report.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const start = (page - 1) * pageSize;

    return { items: reports.slice(start, start + pageSize), page, pageSize, total: reports.length };
  }

  async findNearby(center: GeoPoint, radiusMeters: number, limit: number): Promise<NearbyReport[]> {
    return this.activeReports()
      .filter((report) => PUBLIC_REPORT_STATUSES.includes(report.status))
      .map((report) => ({ report, distanceMeters: report.location.distanceTo(center) }))
      .filter(({ distanceMeters }) => distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.report.id.localeCompare(b.report.id))
      .slice(0, limit);
  }

  async countCreatedSince(authorId: string, since: Date): Promise<number> {
    return [...this.database.reports.values()].filter(
      (report) => report.authorId === authorId && report.createdAt >= since,
    ).length;
  }

  async softDelete(report: Report): Promise<void> {
    if (this.database.reports.get(report.id)?.status !== ReportStatus.PENDING) {
      throw new ReportNotDeletableError();
    }

    this.database.reports.set(report.id, report);
  }

  async vote(reportId: string, apply: (report: Report) => ReportVote): Promise<Report | null> {
    const stored = await this.findById(reportId);
    if (!stored) {
      return null;
    }

    // A regra roda numa cópia, gravada só no fim: um erro não deixa a contagem pela metade.
    const updated = withReportChanges(stored, {});
    const vote = apply(updated);
    if (this.database.votes.some((v) => v.reportId === reportId && v.voterId === vote.voterId)) {
      throw new DuplicateVoteError();
    }

    this.database.votes.push(vote);
    this.database.reports.set(reportId, updated);

    return updated;
  }

  async findVotes(voterId: string, reportIds: string[]): Promise<Map<string, ReportVoteType>> {
    return new Map(
      this.database.votes
        .filter((vote) => vote.voterId === voterId && reportIds.includes(vote.reportId))
        .map((vote) => [vote.reportId, vote.type]),
    );
  }

  private activeReports(): Report[] {
    return [...this.database.reports.values()].filter((report) => !report.isDeleted);
  }
}

export class InMemoryReportPhotoRepository extends ReportPhotoRepository {
  constructor(private readonly database: InMemoryReportsDatabase) {
    super();
  }

  async findContent(reportId: string, size: ReportPhotoSize): Promise<ReportPhotoContent | null> {
    const photo = this.database.photos.get(reportId);
    if (!photo) {
      return null;
    }

    const image = size === ReportPhotoSize.THUMBNAIL ? photo.thumbnail : photo.content;

    return { photoId: photo.id, mimeType: image.mimeType, bytes: image.bytes };
  }
}
