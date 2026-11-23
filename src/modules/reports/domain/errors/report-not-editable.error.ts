import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN33: o reporte só é editado enquanto está em validação (PENDING). */
export class ReportNotEditableError extends BusinessRuleError {
  constructor() {
    super('Só é possível editar um reporte em validação.');
  }
}
