import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** Coordenada fora da faixa ou precisão que não é um número de metros. */
export class InvalidLocationError extends BusinessRuleError {
  constructor(field: 'latitude' | 'longitude' | 'accuracyMeters', message: string) {
    super(message, { field });
  }
}
