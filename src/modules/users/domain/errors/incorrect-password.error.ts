import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * A senha informada para confirmar a troca de senha, a autoexclusão ou a mudança da verificação
 * em duas etapas não confere (RN13, RN15, RN24).
 *
 * Responde 422, e não 401: os SDKs do SuperTokens tratam todo 401 como sessão vencida, renovam a
 * sessão e repetem a chamada, e o front nunca recebe esta resposta.
 */
export class IncorrectPasswordError extends BusinessRuleError {
  /** @param field Campo do corpo com a senha conferida (`currentPassword` ou `password`). */
  constructor(field: string) {
    super('Senha incorreta.', { field });
  }
}
