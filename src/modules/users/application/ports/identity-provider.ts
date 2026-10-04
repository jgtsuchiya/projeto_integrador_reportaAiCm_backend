import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role } from '../../domain/value-objects/role';

/**
 * Porta para o provedor de identidade, que guarda as credenciais, as sessões e o papel
 * espelhado no token. A implementação é o `SuperTokensIdentityProvider` (infra), e nada
 * fora da infra importa o SDK do SuperTokens.
 *
 * O MySQL continua sendo a fonte da verdade de papel e status: o provedor só recebe cópias.
 */
export abstract class IdentityProvider {
  /**
   * Cria a credencial e retorna o id gerado, que passa a ser o `users.id`.
   * Lança `EmailAlreadyInUseError` se o e-mail já tiver credencial.
   */
  abstract createCredentials(email: Email, password: Password): Promise<string>;

  /**
   * Confere a senha atual (troca de senha e autoexclusão). Recebe a senha sem validar a
   * política, porque uma senha antiga pode não seguir a política atual.
   */
  abstract verifyPassword(email: Email, password: string): Promise<boolean>;

  /** Lança `UserNotFoundError` se o usuário não tiver credencial. */
  abstract updatePassword(userId: string, password: Password): Promise<void>;

  /** Remove o usuário do provedor, com as credenciais, as sessões e os papéis. */
  abstract deleteCredentials(userId: string): Promise<void>;

  abstract revokeAllSessions(userId: string): Promise<void>;

  /** Revoga as sessões do usuário, menos a informada (a da requisição atual). */
  abstract revokeOtherSessions(userId: string, currentSessionHandle: string): Promise<void>;

  /** Cria os papéis no provedor. Idempotente: os que já existem são mantidos. */
  abstract createRoles(roles: readonly Role[]): Promise<void>;

  /** O papel precisa existir no provedor (`createRoles`, chamado pelo seed). */
  abstract assignRole(userId: string, role: Role): Promise<void>;
}
