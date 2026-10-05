import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** RN24: a verificação em duas etapas só é ativada com o e-mail verificado. */
export class EmailNotVerifiedError extends BusinessRuleError {
  constructor() {
    super('Verifique o seu e-mail antes de ativar a verificação em duas etapas.');
  }
}
