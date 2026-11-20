import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

export class InvalidReportDescriptionError extends BusinessRuleError {
  constructor(maxLength: number) {
    super(`A descrição deve ter no máximo ${maxLength} caracteres.`, { field: 'description' });
  }
}
