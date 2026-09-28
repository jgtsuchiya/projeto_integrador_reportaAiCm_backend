import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidEmailError extends BusinessRuleError {
  constructor() {
    super('E-mail inválido.', { field: 'email' });
  }
}
