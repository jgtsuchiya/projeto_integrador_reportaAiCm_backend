import { Injectable } from '@nestjs/common';
import supertokens from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import UserRoles from 'supertokens-node/recipe/userroles';

import { IdentityProvider, IdentitySession } from '../../application/ports/identity-provider';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role } from '../../domain/value-objects/role';
import { readSessionOrigin } from './session-origin';

/** O projeto não usa multitenancy: tudo fica no tenant padrão do SuperTokens. */
const TENANT_ID = 'public';

/**
 * Implementação do `IdentityProvider` com o SDK do SuperTokens, que precisa estar
 * inicializado (`SuperTokensService`, no AuthModule).
 */
@Injectable()
export class SuperTokensIdentityProvider implements IdentityProvider {
  async createCredentials(email: Email, password: Password): Promise<string> {
    const result = await EmailPassword.signUp(TENANT_ID, email.value, password.value);

    if (result.status === 'EMAIL_ALREADY_EXISTS_ERROR') {
      throw new EmailAlreadyInUseError();
    }

    return result.user.id;
  }

  async verifyPassword(email: Email, password: string): Promise<boolean> {
    const result = await EmailPassword.verifyCredentials(TENANT_ID, email.value, password);

    return result.status === 'OK';
  }

  async updatePassword(userId: string, password: Password): Promise<void> {
    const result = await EmailPassword.updateEmailOrPassword({
      recipeUserId: supertokens.convertToRecipeUserId(userId),
      password: password.value,
      // A política (RN08) já foi aplicada pelo value object Password.
      applyPasswordPolicy: false,
    });

    switch (result.status) {
      case 'OK':
        return;
      case 'UNKNOWN_USER_ID_ERROR':
        throw new UserNotFoundError();
      case 'PASSWORD_POLICY_VIOLATED_ERROR':
        throw new InvalidPasswordError(result.failureReason);
      default:
        throw new Error(`Falha ao trocar a senha no SuperTokens: ${result.status}.`);
    }
  }

  async deleteCredentials(userId: string): Promise<void> {
    await supertokens.deleteUser(userId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await Session.revokeAllSessionsForUser(userId);
  }

  async revokeOtherSessions(userId: string, currentSessionHandle: string): Promise<void> {
    const handles = await Session.getAllSessionHandlesForUser(userId);
    const others = handles.filter((handle) => handle !== currentSessionHandle);

    if (others.length > 0) {
      await Session.revokeMultipleSessions(others);
    }
  }

  async listSessions(userId: string): Promise<IdentitySession[]> {
    const handles = await Session.getAllSessionHandlesForUser(userId);
    const sessions = await Promise.all(
      handles.map((handle) => Session.getSessionInformation(handle)),
    );

    // Uma sessão encerrada entre as duas consultas volta undefined.
    return sessions.flatMap((session) =>
      session
        ? [
            {
              handle: session.sessionHandle,
              createdAt: new Date(session.timeCreated),
              expiresAt: new Date(session.expiry),
              ...readSessionOrigin(session.sessionDataInDatabase),
            },
          ]
        : [],
    );
  }

  async revokeSession(sessionHandle: string): Promise<void> {
    await Session.revokeSession(sessionHandle);
  }

  async createRoles(roles: readonly Role[]): Promise<void> {
    // Sem permissões: a autorização é feita pelo papel, conferido no MySQL.
    for (const role of roles) {
      await UserRoles.createNewRoleOrAddPermissions(role, []);
    }
  }

  async assignRole(userId: string, role: Role): Promise<void> {
    const result = await UserRoles.addRoleToUser(TENANT_ID, userId, role);

    if (result.status === 'UNKNOWN_ROLE_ERROR') {
      // Os papéis são criados no SuperTokens pelo seed (npm run seed).
      throw new Error(`O papel ${role} não existe no SuperTokens.`);
    }
  }
}
