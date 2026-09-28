import { DomainError } from './domain.error';

/** A operação viola uma regra de negócio (ex.: transição de status inválida). */
export class BusinessRuleError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
