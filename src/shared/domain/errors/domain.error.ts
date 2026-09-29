/**
 * Base dos erros de domínio. O domínio não conhece HTTP: quem converte cada
 * categoria em status é o filtro global de exceções (camada de apresentação).
 *
 * Os erros de cada feature devem estender uma das categorias
 * (`NotFoundError`, `ConflictError`, `BusinessRuleError`, `ForbiddenError` ou
 * `UnauthorizedError`), e não esta classe diretamente.
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
