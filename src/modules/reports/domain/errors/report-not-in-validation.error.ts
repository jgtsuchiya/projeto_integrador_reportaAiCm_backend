import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * RN37 e RN39: só o reporte em validação (PENDING) recebe votos. Depois de CONFIRMED ou
 * REJECTED, a mudança é definitiva, e os votos seguintes são recusados.
 */
export class ReportNotInValidationError extends BusinessRuleError {
  constructor() {
    super('Este reporte não está mais em validação.');
  }
}
