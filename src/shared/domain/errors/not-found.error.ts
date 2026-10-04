import { DomainError } from './domain.error';

/** O recurso procurado não existe. */
export class NotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
