import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN28: a localização fica fora da área atendida (`REPORT_AREA_BOUNDS`). */
export class LocationOutsideAreaError extends BusinessRuleError {
  constructor() {
    super('Este lugar fica fora de Campo Mourão.');
  }
}
