import { NotFoundError } from '@shared/domain/errors/not-found.error';

/**
 * O reporte não existe, foi excluído ou o usuário não pode vê-lo (RN35). Os três casos respondem
 * igual, para não revelar que o reporte existe.
 */
export class ReportNotFoundError extends NotFoundError {
  constructor() {
    super('Reporte não encontrado.');
  }
}
