import { ForbiddenError } from '@shared/domain/errors/forbidden.error';

/** RN15: só o CLIENT exclui a própria conta. ADMIN e SUPER_ADMIN não se autoexcluem. */
export class SelfDeletionNotAllowedError extends ForbiddenError {
  constructor() {
    super('Só o cidadão pode excluir a própria conta.');
  }
}
