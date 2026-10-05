import { DomainError } from './domain.error';

/** A identidade do usuário não foi confirmada, como uma senha atual incorreta. */
export class UnauthorizedError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
