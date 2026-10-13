import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * RN25: o código da segunda etapa do login está errado, expirou, já foi usado, atingiu o
 * limite de erros ou foi substituído por um reenvio. A mensagem é a mesma em todos os casos,
 * para não revelar qual deles aconteceu.
 */
export class InvalidLoginCodeError extends BusinessRuleError {
  constructor() {
    super('Código inválido ou expirado.', { field: 'code' });
  }
}
