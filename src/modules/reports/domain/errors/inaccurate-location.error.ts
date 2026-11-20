import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN28: a precisão da localização é pior que a aceita (`REPORT_MAX_ACCURACY_METERS`). */
export class InaccurateLocationError extends BusinessRuleError {
  constructor() {
    super('A localização está imprecisa. Tente de novo num lugar aberto.');
  }
}
