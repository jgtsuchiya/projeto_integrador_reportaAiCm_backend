import { DomainError } from './domain.error';

/** O usuário está autenticado, mas a regra de negócio não permite a operação. */
export class ForbiddenError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
