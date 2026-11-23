/**
 * Base dos erros de domínio. O domínio não conhece HTTP: quem converte cada
 * categoria em status é o filtro global de exceções (camada de apresentação).
 *
 * Os erros de cada feature devem estender uma das categorias
 * (`NotFoundError`, `ConflictError`, `BusinessRuleError` ou `ForbiddenError`), e não esta
 * classe diretamente. Não há categoria para o 401: os SDKs de front tratam todo 401 como sessão
 * vencida, e ele fica só para a falta de sessão, que o SuperTokens responde.
 */
export abstract class DomainError extends Error {
  protected constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
