import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidCpfError extends BusinessRuleError {
  constructor() {
    super('CPF inválido.', { field: 'cpf' });
  }
}
