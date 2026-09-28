import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class UserAlreadyDeletedError extends BusinessRuleError {
  constructor() {
    super('O usuário já foi excluído.');
  }
}
