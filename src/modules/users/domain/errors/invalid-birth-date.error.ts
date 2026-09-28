import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidBirthDateError extends BusinessRuleError {
  constructor(message: string) {
    super(message, { field: 'birthDate' });
  }
}
