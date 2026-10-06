import { randomUUID } from 'node:crypto';

import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import UserRoles from 'supertokens-node/recipe/userroles';

import { envSchema } from '@config/env.schema';
import { buildSuperTokensConfig } from '@modules/auth/infra/supertokens/supertokens.config';
import { EmailAlreadyInUseError } from '@modules/users/domain/errors/email-already-in-use.error';
import { UserNotFoundError } from '@modules/users/domain/errors/user-not-found.error';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role } from '@modules/users/domain/value-objects/role';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';

describe('SuperTokensIdentityProvider (integração)', () => {
  const env = envSchema.parse(process.env);
  const sut = new SuperTokensIdentityProvider();
  const password = Password.create('senha-forte-1');
  const createdIds: string[] = [];

  beforeAll(async () => {
    // Os hooks só são usados pelas rotas nativas do SuperTokens, que este teste não chama.
    supertokens.init(
      buildSuperTokensConfig(env, {
        isLoginLocked: async () => false,
        recordLoginAttempt: async () => {},
        authorizeSignIn: async () => true,
        checkPasswordPolicy: async () => null,
      }),
    );
    // Em produção, o seed cria os papéis. Aqui o teste garante que o CLIENT existe.
    await UserRoles.createNewRoleOrAddPermissions(Role.CLIENT, []);
  });

  afterAll(async () => {
    await Promise.all(createdIds.map((id) => supertokens.deleteUser(id)));
  });

  async function createUser(): Promise<{ id: string; email: Email }> {
    const email = Email.create(`teste.${randomUUID()}@reportaai.invalid`);
    const id = await sut.createCredentials(email, password);
    createdIds.push(id);

    return { id, email };
  }

  it('deve criar a credencial e conferir a senha', async () => {
    const { id, email } = await createUser();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(sut.verifyPassword(email, 'senha-forte-1')).resolves.toBe(true);
    await expect(sut.verifyPassword(email, 'senha-errada-1')).resolves.toBe(false);
  });

  it('deve recusar um e-mail que já tem credencial', async () => {
    const { email } = await createUser();

    await expect(sut.createCredentials(email, password)).rejects.toThrow(EmailAlreadyInUseError);
  });

  it('deve trocar a senha', async () => {
    const { id, email } = await createUser();

    await sut.updatePassword(id, Password.create('nova-senha-2'));

    await expect(sut.verifyPassword(email, 'senha-forte-1')).resolves.toBe(false);
    await expect(sut.verifyPassword(email, 'nova-senha-2')).resolves.toBe(true);
  });

  it('deve lançar UserNotFoundError ao trocar a senha de um usuário inexistente', async () => {
    await expect(sut.updatePassword(randomUUID(), password)).rejects.toThrow(UserNotFoundError);
  });

  it('deve atribuir o papel ao usuário', async () => {
    const { id } = await createUser();

    await sut.assignRole(id, Role.CLIENT);

    await expect(UserRoles.getRolesForUser('public', id)).resolves.toMatchObject({
      roles: [Role.CLIENT],
    });
  });

  it('deve revogar todas as sessões do usuário', async () => {
    const { id } = await createUser();
    const recipeUserId = supertokens.convertToRecipeUserId(id);
    await Session.createNewSessionWithoutRequestResponse('public', recipeUserId);
    await Session.createNewSessionWithoutRequestResponse('public', recipeUserId);

    await sut.revokeAllSessions(id);

    await expect(Session.getAllSessionHandlesForUser(id)).resolves.toEqual([]);
  });

  it('deve remover o usuário e liberar o e-mail', async () => {
    const { id, email } = await createUser();

    await sut.deleteCredentials(id);

    await expect(supertokens.getUser(id)).resolves.toBeUndefined();
    await expect(sut.verifyPassword(email, 'senha-forte-1')).resolves.toBe(false);

    const newId = await sut.createCredentials(email, password);
    createdIds.push(newId);
    expect(newId).not.toBe(id);
  });
});
