import { DomainError } from './domain.error';

/** O recurso já existe ou conflita com o estado atual (ex.: e-mail já cadastrado). */
export class ConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
