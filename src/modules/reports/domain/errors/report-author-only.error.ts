import { ForbiddenError } from '@shared/domain/errors/forbidden.error';

/** RN33 e RN34: só o autor edita e exclui o reporte. */
export class ReportAuthorOnlyError extends ForbiddenError {
  constructor() {
    super('Só quem abriu o reporte pode editá-lo ou excluí-lo.');
  }
}
