import { ForbiddenError } from '@shared/domain/errors/forbidden.error';

/** RN03: o SUPER_ADMIN só é criado pelo seed e não pode ser inativado nem excluído. */
export class SuperAdminProtectedError extends ForbiddenError {
  constructor() {
    super('O super administrador não pode ser inativado nem excluído.');
  }
}
