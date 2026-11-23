import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportPhoto } from '../entities/report-photo.entity';
import { ReportVote } from '../entities/report-vote.entity';
import { Report } from '../entities/report.entity';
import { GeoPoint } from '../value-objects/geo-point';
import { ReportStatus } from '../value-objects/report-status';
import { ReportVoteType } from '../value-objects/report-vote-type';

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
   * Grava a edição do autor: a descrição e, com a foto, a troca da anterior pela nova, na mesma
   * transação (RN33). A localização (RN28) e as colunas da validação, que só o `vote` grava, não
   * são regravadas.
   *
   * Lança `ReportHasVotesError` quando o reporte recebeu um voto entre a leitura e a gravação:
   * a edição não vale para um reporte que já tem votos, mesmo com os pedidos simultâneos.
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
  /**
   * Grava a exclusão lógica feita por `Report.delete()` (RN34). Lança `ReportNotDeletableError`
   * quando o reporte saiu de PENDING entre a leitura e a gravação, por um voto simultâneo.
   */
  abstract softDelete(report: Report): Promise<void>;
  /**
   * Registra um voto (RN40). Numa transação, trava a linha do reporte (`SELECT ... FOR UPDATE`),
   * entrega o reporte travado à `apply` (a regra da entidade, `Report.registerVote`), grava o voto
   * que ela devolve e as contagens e o status do reporte, e confirma. Os votos simultâneos no
   * mesmo reporte esperam a vez: nenhum se perde, e o status muda uma vez só.
   *
   * Devolve o reporte atualizado, ou `null` se ele não existe ou foi excluído. Um erro da `apply`
   * desfaz a transação. Lança `DuplicateVoteError` quando o usuário já votou no reporte.
   */
  abstract vote(reportId: string, apply: (report: Report) => ReportVote): Promise<Report | null>;
  /**
   * Os votos do usuário nos reportes informados, pelo id do reporte. Os reportes em que ele não
   * votou ficam de fora. Serve ao `votes.mine` e ao `canVote` das respostas.
   */
  abstract findVotes(voterId: string, reportIds: string[]): Promise<Map<string, ReportVoteType>>;
}
