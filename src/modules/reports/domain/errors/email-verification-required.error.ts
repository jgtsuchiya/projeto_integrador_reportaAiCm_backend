import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/** O que o Client tentou fazer sem o e-mail verificado, para a mensagem. */
export type EmailVerifiedAction = 'open' | 'vote';

const ACTION_TEXT: Record<EmailVerifiedAction, string> = {
  open: 'abrir reportes',
  vote: 'votar nos reportes',
};

/**
 * RN26 e RN37: só o Client com o e-mail verificado abre reportes e vota. Sem essa barreira,
 * contas descartáveis bastariam para confirmar um reporte falso.
 */
export class EmailVerificationRequiredError extends BusinessRuleError {
  constructor(action: EmailVerifiedAction = 'open') {
    super(`Confirme o seu e-mail para ${ACTION_TEXT[action]}.`);
  }
}
