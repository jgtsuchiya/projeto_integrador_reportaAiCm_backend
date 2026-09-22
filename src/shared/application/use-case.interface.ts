/**
 * Contrato base para todos os casos de uso da camada de aplicação.
 * Cada caso de uso expõe uma única operação de negócio via `execute`.
 */
export interface UseCase<Input = void, Output = void> {
  execute(input: Input): Promise<Output>;
}
