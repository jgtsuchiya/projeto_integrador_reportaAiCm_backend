import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportPhoto } from '../domain/entities/report-photo.entity';
import { Report } from '../domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '../domain/errors/duplicate-idempotency-key.error';
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
import { PUBLIC_REPORT_STATUSES } from '../domain/value-objects/report-status';

/**
 * Fakes do módulo reports para os testes de caso de uso. Os repositórios compartilham um
 * `InMemoryReportsDatabase`, como as tabelas do MySQL. A distância é calculada por haversine
 * (`GeoPoint.distanceTo`), na esfera: o MySQL calcula no elipsoide, e os dois diferem em menos
 * de 0,5%.
 *
 * As entidades são guardadas por referência: uma alteração feita pelo caso de uso aparece no
 * "banco" mesmo sem ser gravada. As gravações simultâneas são testadas contra o MySQL.
 */
export class InMemoryReportsDatabase {
  readonly reports = new Map<string, Report>();
  /** Fotos pelo id do reporte, uma por reporte, como o UNIQUE de `report_photos`. */
  readonly photos = new Map<string, ReportPhoto>();
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
    this.database.reports.set(report.id, report);
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
