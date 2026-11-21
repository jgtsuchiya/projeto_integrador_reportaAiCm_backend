import { ConflictError } from '@shared/domain/errors/conflict.error';

/**
 * RN37: um voto por usuário e reporte, que não muda depois de dado. É o que o repositório lança
 * quando o UNIQUE (`report_id`, `user_id`) recusa o voto.
 */
export class DuplicateVoteError extends ConflictError {
  constructor() {
    super('Você já votou neste reporte.');
  }
}
