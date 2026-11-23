import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN33: depois do primeiro voto, o reporte não muda mais, para os votos valerem para ele. */
export class ReportHasVotesError extends BusinessRuleError {
  constructor() {
    super('O reporte já recebeu votos e não pode mais ser editado.');
  }
}
