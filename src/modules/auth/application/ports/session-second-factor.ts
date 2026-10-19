/**
 * Porta para a segunda etapa do login na sessão da requisição (RN25): a sessão aberta pela
 * senha de quem tem a verificação em duas etapas ativa fica pendente até o código ser
 * conferido. A implementação é o `SuperTokensSessionSecondFactor` (infra), com uma claim de
 * sessão.
 *
 * `TSession` é a sessão que o provedor de identidade entrega ao verificar a requisição (no
 * SuperTokens, o `SessionContainer`). A porta não conhece esse tipo: quem conhece são a infra,
 * que a implementa, e o guard e os controllers, que recebem a sessão do SDK.
 */
export abstract class SessionSecondFactor<TSession = unknown> {
  /** A senha já foi conferida, e o código da segunda etapa ainda não. */
  abstract isPending(session: TSession): Promise<boolean>;

  /**
   * Recusa a sessão pendente com o erro que o provedor responde como 403 (`invalid claim`).
   * Não faz nada com a sessão completa.
   */
  abstract assertCompleted(session: TSession): Promise<void>;

  /**
   * Marca a segunda etapa como concluída. A alteração é feita na sessão da requisição, e não
   * pelo identificador dela: só assim o access token atualizado já volta na resposta.
   */
  abstract complete(session: TSession): Promise<void>;
}
