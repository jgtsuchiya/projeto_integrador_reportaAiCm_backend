import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidUserNameError extends BusinessRuleError {
  constructor(message: string) {
    super(message, { field: 'name' });
  }
}
