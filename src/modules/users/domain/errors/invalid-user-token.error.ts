import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * O token do link não existe, expirou, já foi usado ou foi substituído por um reenvio.
 * A mensagem é a mesma nos quatro casos, para não revelar qual deles aconteceu.
 */
export class InvalidUserTokenError extends BusinessRuleError {
  constructor() {
    super('Link inválido, expirado ou já utilizado.', { field: 'token' });
  }
}
