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
  /** Grava só o contador de erros do código (`attempts`), depois de um `registerFailedAttempt`. */
  abstract saveAttempts(token: UserToken): Promise<void>;
  /** Remove todos os tokens do usuário, como o convite pendente de um ADMIN excluído. */
  abstract deleteByUserId(userId: string): Promise<void>;
}
