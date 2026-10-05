import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidPhoneError extends BusinessRuleError {
  constructor() {
    super('Telefone inválido. Informe o DDD e o número.', { field: 'phone' });
  }
}
