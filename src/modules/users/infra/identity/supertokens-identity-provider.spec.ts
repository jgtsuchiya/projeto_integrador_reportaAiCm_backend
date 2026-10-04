import supertokens from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import UserRoles from 'supertokens-node/recipe/userroles';

import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role } from '../../domain/value-objects/role';
import { SuperTokensIdentityProvider } from './supertokens-identity-provider';

jest.mock('supertokens-node', () => ({
  __esModule: true,
  default: { convertToRecipeUserId: jest.fn(), deleteUser: jest.fn() },
}));
jest.mock('supertokens-node/recipe/emailpassword', () => ({
  __esModule: true,
  default: { signUp: jest.fn(), verifyCredentials: jest.fn(), updateEmailOrPassword: jest.fn() },
}));
jest.mock('supertokens-node/recipe/session', () => ({
  __esModule: true,
  default: { revokeAllSessionsForUser: jest.fn() },
}));
jest.mock('supertokens-node/recipe/userroles', () => ({
  __esModule: true,
  default: { addRoleToUser: jest.fn() },
}));

const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';

describe('SuperTokensIdentityProvider', () => {
  const email = Email.create('maria@example.com');
  const password = Password.create('senha-forte-1');
  let sut: SuperTokensIdentityProvider;

  beforeEach(() => {
    sut = new SuperTokensIdentityProvider();
  });

  describe('createCredentials', () => {
    it('deve criar a credencial no tenant padrão e retornar o id do usuário', async () => {
      jest.mocked(EmailPassword.signUp).mockResolvedValue({
        status: 'OK',
        user: { id: USER_ID },
      } as Awaited<ReturnType<typeof EmailPassword.signUp>>);

      await expect(sut.createCredentials(email, password)).resolves.toBe(USER_ID);
      expect(EmailPassword.signUp).toHaveBeenCalledWith(
        'public',
        'maria@example.com',
        'senha-forte-1',
      );
    });

    it('deve lançar EmailAlreadyInUseError quando o e-mail já tem credencial', async () => {
      jest.mocked(EmailPassword.signUp).mockResolvedValue({ status: 'EMAIL_ALREADY_EXISTS_ERROR' });

      await expect(sut.createCredentials(email, password)).rejects.toThrow(EmailAlreadyInUseError);
    });
  });

  describe('verifyPassword', () => {
    it.each([
      ['OK', true],
      ['WRONG_CREDENTIALS_ERROR', false],
    ] as const)('deve retornar %p → %p', async (status, expected) => {
      jest.mocked(EmailPassword.verifyCredentials).mockResolvedValue({ status });

      await expect(sut.verifyPassword(email, 'qualquer')).resolves.toBe(expected);
      expect(EmailPassword.verifyCredentials).toHaveBeenCalledWith(
        'public',
        'maria@example.com',
        'qualquer',
      );
    });
  });

  describe('updatePassword', () => {
    const recipeUserId = { getAsString: () => USER_ID };

    beforeEach(() => {
      jest
        .mocked(supertokens.convertToRecipeUserId)
        .mockReturnValue(recipeUserId as ReturnType<typeof supertokens.convertToRecipeUserId>);
    });

    it('deve gravar a nova senha sem reaplicar a política do SuperTokens', async () => {
      jest.mocked(EmailPassword.updateEmailOrPassword).mockResolvedValue({ status: 'OK' });

      await sut.updatePassword(USER_ID, password);

      expect(supertokens.convertToRecipeUserId).toHaveBeenCalledWith(USER_ID);
      expect(EmailPassword.updateEmailOrPassword).toHaveBeenCalledWith({
        recipeUserId,
        password: 'senha-forte-1',
        applyPasswordPolicy: false,
      });
    });

    it('deve lançar UserNotFoundError quando o usuário não existe', async () => {
      jest
        .mocked(EmailPassword.updateEmailOrPassword)
        .mockResolvedValue({ status: 'UNKNOWN_USER_ID_ERROR' });

      await expect(sut.updatePassword(USER_ID, password)).rejects.toThrow(UserNotFoundError);
    });

    it('deve lançar InvalidPasswordError quando a política é violada', async () => {
      jest.mocked(EmailPassword.updateEmailOrPassword).mockResolvedValue({
        status: 'PASSWORD_POLICY_VIOLATED_ERROR',
        failureReason: 'Senha fraca.',
      });

      await expect(sut.updatePassword(USER_ID, password)).rejects.toThrow(
        new InvalidPasswordError('Senha fraca.'),
      );
    });

    it('deve lançar um erro genérico para os demais status', async () => {
      jest
        .mocked(EmailPassword.updateEmailOrPassword)
        .mockResolvedValue({ status: 'EMAIL_ALREADY_EXISTS_ERROR' });

      await expect(sut.updatePassword(USER_ID, password)).rejects.toThrow(
        'Falha ao trocar a senha no SuperTokens: EMAIL_ALREADY_EXISTS_ERROR.',
      );
    });
  });

  it('deve remover o usuário do SuperTokens', async () => {
    jest.mocked(supertokens.deleteUser).mockResolvedValue({ status: 'OK' });

    await sut.deleteCredentials(USER_ID);

    expect(supertokens.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it('deve revogar todas as sessões do usuário', async () => {
    jest.mocked(Session.revokeAllSessionsForUser).mockResolvedValue([]);

    await sut.revokeAllSessions(USER_ID);

    expect(Session.revokeAllSessionsForUser).toHaveBeenCalledWith(USER_ID);
  });

  describe('assignRole', () => {
    it('deve atribuir o papel no tenant padrão', async () => {
      jest
        .mocked(UserRoles.addRoleToUser)
        .mockResolvedValue({ status: 'OK', didUserAlreadyHaveRole: false });

      await sut.assignRole(USER_ID, Role.CLIENT);

      expect(UserRoles.addRoleToUser).toHaveBeenCalledWith('public', USER_ID, 'CLIENT');
    });

    it('deve falhar quando o papel não existe no SuperTokens', async () => {
      jest.mocked(UserRoles.addRoleToUser).mockResolvedValue({ status: 'UNKNOWN_ROLE_ERROR' });

      await expect(sut.assignRole(USER_ID, Role.ADMIN)).rejects.toThrow(
        'O papel ADMIN não existe no SuperTokens.',
      );
    });
  });
});
