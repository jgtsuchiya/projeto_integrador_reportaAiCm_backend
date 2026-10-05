import { UserToken } from '../../domain/entities/user-token.entity';
import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { UserLinkTokenType } from '../../domain/value-objects/user-token-type';

/**
 * Busca o token recebido num link e confere se ele vale para o fluxo que o recebeu. Um token
 * inexistente, de outro tipo (ex.: o do convite na redefinição de senha), expirado, já usado
 * ou substituído por um reenvio é tratado da mesma forma: `InvalidUserTokenError` (422).
 */
export async function findUsableTokenOrFail(
  userTokenRepository: UserTokenRepository,
  secret: string,
  type: UserLinkTokenType,
): Promise<UserToken> {
  const token = await userTokenRepository.findByHash(UserToken.hash(secret));

  if (token?.type !== type || !token.isUsable()) {
    throw new InvalidUserTokenError();
  }

  return token;
}
