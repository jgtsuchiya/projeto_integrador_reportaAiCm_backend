import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { IssuedUserToken, UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { UserLinkTokenType, UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  FakeIdentityProvider,
  InMemoryLoginAttemptRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { LoginLockService } from '../services/login-lock.service';
import { PASSWORD_CHANGED_MAIL_SUBJECT } from '../services/password-changed-notice';
import { UserMailService } from '../services/user-mail.service';
import { ResetPasswordUseCase } from './reset-password.use-case';

const OLD_PASSWORD = 'senha-antiga-1';
const NEW_PASSWORD = 'senha-nova-2';
const MAX_FAILED_ATTEMPTS = 5;

describe('ResetPasswordUseCase', () => {
  const email = Email.create('maria@example.com');
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let tokenRepository: InMemoryUserTokenRepository;
  let loginAttemptRepository: InMemoryLoginAttemptRepository;
  let identityProvider: FakeIdentityProvider;
  let loginLockService: LoginLockService;
  let mailSender: FakeMailSender;
  let sut: ResetPasswordUseCase;
  let user: User;
  let token: UserToken;
  let secret: string;

  beforeEach(async () => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    tokenRepository = new InMemoryUserTokenRepository(database);
    loginAttemptRepository = new InMemoryLoginAttemptRepository(database);
    identityProvider = new FakeIdentityProvider();
    loginLockService = new LoginLockService(loginAttemptRepository, {
      maxFailedAttempts: MAX_FAILED_ATTEMPTS,
      windowMinutes: 15,
    });
    mailSender = new FakeMailSender();
    sut = new ResetPasswordUseCase(
      userRepository,
      tokenRepository,
      identityProvider,
      loginLockService,
      new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
    );

    const id = await identityProvider.createCredentials(email, Password.create(OLD_PASSWORD));
    user = User.createClient({ id, name: 'Maria', email });
    ({ token, secret } = issueToken(UserTokenType.PASSWORD_RESET));
    database.users.set(user.id, user);
    identityProvider.sessions.set(user.id, ['celular', 'notebook']);
  });

  function issueToken(type: UserLinkTokenType): IssuedUserToken {
    const issued = UserToken.issue({ userId: user.id, type, validForMinutes: 60 });
    database.tokens.set(issued.token.id, issued.token);

    return issued;
  }

  function currentPassword(): string | undefined {
    return identityProvider.credentials.get(user.id)?.password;
  }

  it('deve gravar a senha nova, revogar todas as sessões e marcar o token como usado (RN21)', async () => {
    await sut.execute({ token: secret, password: NEW_PASSWORD });

    expect(currentPassword()).toBe(NEW_PASSWORD);
    expect(identityProvider.sessions.get(user.id)).toBeUndefined();
    expect(token.usedAt).toBeInstanceOf(Date);
    expect(token.isUsable()).toBe(false);
  });

  it('deve preencher o email_verified_at de quem ainda não verificou o e-mail', async () => {
    expect(user.emailVerifiedAt).toBeNull();

    await sut.execute({ token: secret, password: NEW_PASSWORD });

    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('deve manter a data de verificação de quem já tinha o e-mail verificado', async () => {
    const verifiedAt = new Date('2026-09-28T12:00:00.000Z');
    user = User.restore(user.id, {
      role: user.role,
      name: user.name,
      email,
      status: user.status,
      emailVerifiedAt: verifiedAt,
      mfaEnabled: false,
      lastLoginAt: null,
      createdById: null,
      createdAt: verifiedAt,
      updatedAt: verifiedAt,
      deletedAt: null,
    });
    database.users.set(user.id, user);

    await sut.execute({ token: secret, password: NEW_PASSWORD });

    expect(user.emailVerifiedAt).toEqual(verifiedAt);
  });

  it('deve zerar o bloqueio do login por tentativas do e-mail', async () => {
    for (let count = 0; count < MAX_FAILED_ATTEMPTS; count += 1) {
      await loginAttemptRepository.save(
        LoginAttempt.record({ email, ipAddress: null, userAgent: null, succeeded: false }),
      );
    }
    await expect(loginLockService.isLocked(email)).resolves.toBe(true);

    await sut.execute({ token: secret, password: NEW_PASSWORD });

    await expect(loginLockService.isLocked(email)).resolves.toBe(false);
  });

  it('deve avisar o usuário da troca por e-mail, sem a senha', async () => {
    await sut.execute({ token: secret, password: NEW_PASSWORD });

    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0]).toMatchObject({
      to: email.value,
      subject: PASSWORD_CHANGED_MAIL_SUBJECT,
    });
    expect(mailSender.messages[0].text).not.toContain(NEW_PASSWORD);
  });

  it('deve concluir a redefinição quando o e-mail de aviso falha', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    await expect(sut.execute({ token: secret, password: NEW_PASSWORD })).resolves.toBeUndefined();

    expect(currentPassword()).toBe(NEW_PASSWORD);
    expect(token.usedAt).toBeInstanceOf(Date);
  });

  it('deve aplicar a política de senha antes de consultar o token (RN08)', async () => {
    const findByHash = jest.spyOn(tokenRepository, 'findByHash');

    await expect(sut.execute({ token: secret, password: 'somenteletras' })).rejects.toThrow(
      InvalidPasswordError,
    );

    expect(findByHash).not.toHaveBeenCalled();
    expect(currentPassword()).toBe(OLD_PASSWORD);
    expect(token.usedAt).toBeNull();
  });

  it('deve recusar um token que não existe', async () => {
    await expect(
      sut.execute({ token: 'token-inexistente', password: NEW_PASSWORD }),
    ).rejects.toThrow(InvalidUserTokenError);

    expect(currentPassword()).toBe(OLD_PASSWORD);
  });

  it('deve recusar um token já usado (uso único)', async () => {
    await sut.execute({ token: secret, password: NEW_PASSWORD });

    await expect(sut.execute({ token: secret, password: 'outra-senha-3' })).rejects.toThrow(
      InvalidUserTokenError,
    );

    expect(currentPassword()).toBe(NEW_PASSWORD);
  });

  it('deve recusar um token expirado, sem trocar a senha', async () => {
    const expired = UserToken.restore('token-expirado', {
      userId: user.id,
      type: UserTokenType.PASSWORD_RESET,
      tokenHash: UserToken.hash('segredo-expirado'),
      attempts: 0,
      expiresAt: new Date(Date.now() - 1),
      usedAt: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    database.tokens.set(expired.id, expired);

    await expect(
      sut.execute({ token: 'segredo-expirado', password: NEW_PASSWORD }),
    ).rejects.toThrow(InvalidUserTokenError);

    expect(currentPassword()).toBe(OLD_PASSWORD);
    expect(identityProvider.sessions.get(user.id)).toHaveLength(2);
  });

  it('deve recusar um token substituído por um pedido novo', async () => {
    const replacement = UserToken.issue({
      userId: user.id,
      type: UserTokenType.PASSWORD_RESET,
      validForMinutes: 60,
    });
    await tokenRepository.replace(replacement.token);

    await expect(sut.execute({ token: secret, password: NEW_PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );

    expect(currentPassword()).toBe(OLD_PASSWORD);
    await expect(
      sut.execute({ token: replacement.secret, password: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });

  it.each([UserTokenType.INVITATION, UserTokenType.EMAIL_VERIFICATION] as const)(
    'deve recusar um token do tipo %s, sem trocar a senha',
    async (type) => {
      const other = issueToken(type);

      await expect(sut.execute({ token: other.secret, password: NEW_PASSWORD })).rejects.toThrow(
        InvalidUserTokenError,
      );

      expect(currentPassword()).toBe(OLD_PASSWORD);
      expect(other.token.usedAt).toBeNull();
    },
  );

  it.each([
    ['excluída', (): void => user.delete()],
    ['que foi inativada depois do pedido', (): void => user.deactivate()],
  ])('deve recusar o token de uma conta %s', async (_case, arrange) => {
    arrange();

    await expect(sut.execute({ token: secret, password: NEW_PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );

    expect(currentPassword()).toBe(OLD_PASSWORD);
    expect(token.usedAt).toBeNull();
    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve manter o link válido quando a redefinição falha antes de o token ser gravado', async () => {
    jest
      .spyOn(identityProvider, 'revokeAllSessions')
      .mockRejectedValueOnce(new Error('SuperTokens fora do ar.'));

    await expect(sut.execute({ token: secret, password: NEW_PASSWORD })).rejects.toThrow(
      'SuperTokens fora do ar.',
    );

    expect(token.usedAt).toBeNull();
    expect(mailSender.messages).toHaveLength(0);
    await expect(sut.execute({ token: secret, password: NEW_PASSWORD })).resolves.toBeUndefined();
    expect(currentPassword()).toBe(NEW_PASSWORD);
    expect(identityProvider.sessions.get(user.id)).toBeUndefined();
    expect(token.usedAt).toBeInstanceOf(Date);
  });
});
