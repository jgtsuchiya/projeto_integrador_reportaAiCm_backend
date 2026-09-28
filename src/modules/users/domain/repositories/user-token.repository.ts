import { UserToken } from '../entities/user-token.entity';

export abstract class UserTokenRepository {
  /** Busca pelo hash do segredo recebido no link (`UserToken.hash`). */
  abstract findByHash(tokenHash: string): Promise<UserToken | null>;
  /**
   * Grava o token novo e remove os anteriores do mesmo usuário e tipo, na mesma transação.
   * É assim que o reenvio do convite invalida os links antigos (RN06).
   */
  abstract replace(token: UserToken): Promise<void>;
  /** Remove todos os tokens do usuário, como o convite pendente de um ADMIN excluído. */
  abstract deleteByUserId(userId: string): Promise<void>;
}
