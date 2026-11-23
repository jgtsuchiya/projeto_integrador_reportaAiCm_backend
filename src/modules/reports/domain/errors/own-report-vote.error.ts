import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN37 e RN39: o autor não vota no próprio reporte, nem conta como confirmação. */
export class OwnReportVoteError extends BusinessRuleError {
  constructor() {
    super('Você não pode votar no próprio reporte.');
  }
}
