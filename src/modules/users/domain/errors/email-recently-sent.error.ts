import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * RN22: a mesma conta recebe no máximo um e-mail do mesmo tipo por minuto
 * (`USER_TOKEN_RESEND_INTERVAL_MINUTES`). Vale para o reenvio pedido por quem tem sessão: o
 * pedido de redefinição de senha, que é público, só ignora o pedido repetido (RN20).
 */
export class EmailRecentlySentError extends BusinessRuleError {
  constructor() {
    super('Um e-mail acabou de ser enviado. Aguarde um minuto para pedir outro.');
  }
}
