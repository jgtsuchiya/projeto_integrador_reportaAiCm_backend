import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * RN26: só o Client com o e-mail verificado abre reportes. Sem essa barreira, contas
 * descartáveis bastariam para confirmar um reporte falso.
 */
export class EmailVerificationRequiredError extends BusinessRuleError {
  constructor() {
    super('Confirme o seu e-mail para abrir reportes.');
  }
}
