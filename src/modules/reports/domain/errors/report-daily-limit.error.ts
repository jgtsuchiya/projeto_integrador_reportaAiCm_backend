import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN30: o Client abriu o máximo de reportes em 24 horas (`REPORT_DAILY_LIMIT`). */
export class ReportDailyLimitError extends BusinessRuleError {
  constructor(limit: number) {
    super(`Você chegou ao limite de ${limit} reportes por dia.`, { limit });
  }
}
