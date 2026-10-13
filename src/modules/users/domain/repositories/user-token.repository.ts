import { UserToken } from '../entities/user-token.entity';
import { UserTokenType } from '../value-objects/user-token-type';

export abstract class UserTokenRepository {
  /** Busca pelo hash do segredo recebido no link (`UserToken.hash`). */
  abstract findByHash(tokenHash: string): Promise<UserToken | null>;
  /**
   * Busca o token mais recente do usuário para o tipo, que é o vigente: o `replace` remove os
   * anteriores. É assim que o código da segunda etapa é localizado, já que o hash dele
   * depende do usuário. O token pode estar usado ou expirado: quem chama confere com `isUsable`.
   */
  abstract findLatest(userId: string, type: UserTokenType): Promise<UserToken | null>;
  /**
   * Grava o token novo e remove os anteriores do mesmo usuário e tipo, na mesma transação.
   * É assim que o reenvio do convite invalida os links antigos (RN06).
   */
  abstract replace(token: UserToken): Promise<void>;
  /**
   * Conta no banco o erro registrado por `registerFailedAttempt`. O contador (`attempts`) é
   * somado no banco, até o limite, em vez de receber o valor da entidade: assim, duas
   * conferências simultâneas do mesmo código contam dois erros, e uma não apaga a da outra.
   */
  abstract saveFailedAttempt(token: UserToken): Promise<void>;
  /**
   * Grava o uso do código (`used_at`), feito por `use()`, só se ele ainda vale no banco: não
   * foi usado, não atingiu o limite de erros nem foi substituído desde que foi lido. Retorna
   * false quando não vale mais, e nada é gravado. É o que impede o código de ser usado duas
   * vezes, ou de ser aceito no meio de uma rajada de erros simultâneos.
   */
  abstract consume(token: UserToken): Promise<boolean>;
  /** Remove todos os tokens do usuário, como o convite pendente de um ADMIN excluído. */
  abstract deleteByUserId(userId: string): Promise<void>;
}
