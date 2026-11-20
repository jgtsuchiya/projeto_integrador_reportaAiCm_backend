import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN34: o reporte só é excluído enquanto está em validação (PENDING). */
export class ReportNotDeletableError extends BusinessRuleError {
  constructor() {
    super('Só é possível excluir um reporte em validação.');
  }
}
