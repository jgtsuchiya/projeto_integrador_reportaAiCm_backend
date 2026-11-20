import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportPhoto } from '../entities/report-photo.entity';
import { Report } from '../entities/report.entity';
import { GeoPoint } from '../value-objects/geo-point';
import { ReportStatus } from '../value-objects/report-status';

/** Filtros da listagem dos reportes de um autor. */
export interface ReportFilter {
  status?: ReportStatus;
}

/** Reporte perto de um ponto, com a distância até ele. */
export interface NearbyReport {
  report: Report;
  /** Em metros, calculada no elipsoide do WGS 84. */
  distanceMeters: number;
}

/**
 * As buscas ignoram os reportes excluídos (`deleted_at` preenchido), menos as que dizem o
 * contrário. Nenhuma busca lê as imagens: elas ficam no `ReportPhotoRepository`.
 */
export abstract class ReportRepository {
  /**
   * Grava o reporte e a foto na mesma transação: se um falhar, nenhum é gravado. Lança
   * `DuplicateIdempotencyKeyError` quando outro pedido do mesmo autor gravou a mesma
   * `Idempotency-Key` antes (RN31).
   */
  abstract create(report: Report, photo: ReportPhoto): Promise<void>;
  /**
   * Grava as alterações do reporte. Com a foto, troca a anterior pela nova na mesma transação
   * (RN33). A localização não é regravada: ela não muda (RN28).
   */
  abstract save(report: Report, photo?: ReportPhoto): Promise<void>;
  abstract findById(id: string): Promise<Report | null>;
  /** Inclui o reporte excluído: a chave já usada não abre outro reporte (RN31). */
  abstract findByIdempotencyKey(authorId: string, idempotencyKey: string): Promise<Report | null>;
  /** Lista paginada dos reportes do autor, do mais novo ao mais antigo. */
  abstract findByAuthor(
    authorId: string,
    page: PageRequest,
    filter: ReportFilter,
  ): Promise<Page<Report>>;
  /**
   * Reportes PENDING e CONFIRMED de qualquer autor a até `radiusMeters` do ponto, do mais perto
   * ao mais longe, até `limit`.
   */
  abstract findNearby(
    center: GeoPoint,
    radiusMeters: number,
    limit: number,
  ): Promise<NearbyReport[]>;
  /** Reportes do autor criados a partir de `since`, contando os excluídos (RN30). */
  abstract countCreatedSince(authorId: string, since: Date): Promise<number>;
  /** Grava a exclusão lógica feita por `Report.delete()` (RN34). */
  abstract softDelete(report: Report): Promise<void>;
}
