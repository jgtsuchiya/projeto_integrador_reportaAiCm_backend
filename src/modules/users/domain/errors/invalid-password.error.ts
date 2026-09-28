import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidPasswordError extends BusinessRuleError {
  constructor(message: string) {
    super(message, { field: 'password' });
  }
}
