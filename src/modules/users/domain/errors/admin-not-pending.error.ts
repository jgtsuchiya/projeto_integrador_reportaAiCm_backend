import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN06: o convite só é reenviado enquanto o ADMIN ainda não o aceitou (PENDING). */
export class AdminNotPendingError extends BusinessRuleError {
  constructor() {
    super('O convite só pode ser reenviado para um administrador pendente.');
  }
}
