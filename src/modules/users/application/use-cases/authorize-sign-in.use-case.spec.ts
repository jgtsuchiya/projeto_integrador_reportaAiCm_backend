import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { LOGIN_CODE_MAIL_SUBJECT, LoginCodeService } from '../services/login-code.service';
import { UserMailService } from '../services/user-mail.service';
import { AuthorizeSignInUseCase } from './authorize-sign-in.use-case';

const MINUTE_IN_MS = 60 * 1000;
const EMAIL = 'maria@example.com';

describe('AuthorizeSignInUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let mailSender: FakeMailSender;
  let sut: AuthorizeSignInUseCase;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    mailSender = new FakeMailSender();
    sut = new AuthorizeSignInUseCase(
      userRepository,
      new LoginCodeService(
        new InMemoryUserTokenRepository(database),
        new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
        { expiresInMinutes: 10 },
      ),
    );
  });

  function createClient(): User {
    const user = User.createClient({ id: 'client-1', name: 'Maria', email: Email.create(EMAIL) });
    database.users.set(user.id, user);

    return user;
  }

  /** Client com a verificação em duas etapas ativa, o que exige o e-mail verificado (RN24). */
  function createClientWithMfa(): User {
    const user = createClient();
    user.verifyEmail();
    user.enableMfa();

    return user;
  }

  /** Código do último e-mail enviado. */
  function lastCode(): string {
    const match = /^\d{6}$/m.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum código foi enviado.');
    }

    return match[0];
  }

  describe('sem a verificação em duas etapas', () => {
    it('deve permitir o login de um usuário ACTIVE e registrar o último acesso', async () => {
      const user = createClient();
      const saveSpy = jest.spyOn(userRepository, 'save');

      const result = await sut.execute({ userId: user.id });

      expect(result).toEqual({ allowed: true, secondFactorRequired: false });
      expect(user.lastLoginAt).toBeInstanceOf(Date);
      expect(saveSpy).toHaveBeenCalledWith(user);
    });

    it('não deve gerar nem enviar código', async () => {
      const user = createClient();

      await sut.execute({ userId: user.id });

      expect(mailSender.messages).toHaveLength(0);
      expect(database.tokens.size).toBe(0);
    });
  });

  describe('com a verificação em duas etapas ativa (RN25)', () => {
    it('deve permitir o login informando que falta a segunda etapa', async () => {
      const user = createClientWithMfa();

      const result = await sut.execute({ userId: user.id });

      expect(result).toEqual({ allowed: true, secondFactorRequired: true });
    });

    it('deve gravar o código de 6 dígitos e enviá-lo por e-mail', async () => {
      const user = createClientWithMfa();

      await sut.execute({ userId: user.id });

      expect(mailSender.messages).toHaveLength(1);
      expect(mailSender.messages[0]).toMatchObject({ to: EMAIL, subject: LOGIN_CODE_MAIL_SUBJECT });
      const [token] = [...database.tokens.values()];
      expect(database.tokens.size).toBe(1);
      expect(token.userId).toBe(user.id);
      expect(token.type).toBe(UserTokenType.LOGIN_CODE);
      expect(token.matchesCode(lastCode())).toBe(true);
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(10 * MINUTE_IN_MS);
      expect(token.isUsable()).toBe(true);
    });

    it('não deve registrar o último acesso: o login só termina quando o código é conferido', async () => {
      const user = createClientWithMfa();
      const saveSpy = jest.spyOn(userRepository, 'save');

      await sut.execute({ userId: user.id });

      expect(user.lastLoginAt).toBeNull();
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('deve manter o código enviado há menos de 1 minuto, sem enviar outro', async () => {
      const user = createClientWithMfa();
      await sut.execute({ userId: user.id });
      const code = lastCode();

      const result = await sut.execute({ userId: user.id });

      expect(result).toEqual({ allowed: true, secondFactorRequired: true });
      expect(mailSender.messages).toHaveLength(1);
      const [token] = [...database.tokens.values()];
      expect(database.tokens.size).toBe(1);
      expect(token.matchesCode(code)).toBe(true);
    });

    it('deve enviar um código novo quando o anterior já foi usado, mesmo há menos de 1 minuto', async () => {
      const user = createClientWithMfa();
      await sut.execute({ userId: user.id });
      const [used] = [...database.tokens.values()];
      used.use();

      await sut.execute({ userId: user.id });

      expect(mailSender.messages).toHaveLength(2);
      const [token] = [...database.tokens.values()];
      expect(database.tokens.size).toBe(1);
      expect(token.equals(used)).toBe(false);
      expect(token.isUsable()).toBe(true);
    });

    it('deve substituir o código enviado há 1 minuto ou mais', async () => {
      const user = createClientWithMfa();
      const createdAt = new Date(Date.now() - MINUTE_IN_MS);
      const old = UserToken.restore('token-antigo', {
        userId: user.id,
        type: UserTokenType.LOGIN_CODE,
        tokenHash: UserToken.hashCode(user.id, '000000'),
        attempts: 3,
        expiresAt: new Date(createdAt.getTime() + 10 * MINUTE_IN_MS),
        usedAt: null,
        createdAt,
      });
      database.tokens.set(old.id, old);

      await sut.execute({ userId: user.id });

      expect(mailSender.messages).toHaveLength(1);
      const [token] = [...database.tokens.values()];
      expect(database.tokens.size).toBe(1);
      expect(token.equals(old)).toBe(false);
      expect(token.attempts).toBe(0);
    });

    it('deve permitir o login mesmo quando o envio do e-mail falha', async () => {
      const user = createClientWithMfa();
      jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

      const result = await sut.execute({ userId: user.id });

      expect(result).toEqual({ allowed: true, secondFactorRequired: true });
      expect(database.tokens.size).toBe(1);
    });
  });

  it('deve recusar um usuário que não existe no MySQL', async () => {
    const saveSpy = jest.spyOn(userRepository, 'save');

    const result = await sut.execute({ userId: 'desconhecido' });

    expect(result).toEqual({ allowed: false });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('deve recusar um usuário INACTIVE, sem registrar o acesso', async () => {
    const user = createClient();
    user.deactivate();

    const result = await sut.execute({ userId: user.id });

    expect(result).toEqual({ allowed: false });
    expect(user.lastLoginAt).toBeNull();
  });

  it('deve recusar um usuário INACTIVE com a verificação em duas etapas, sem enviar o código', async () => {
    const user = createClientWithMfa();
    user.deactivate();

    const result = await sut.execute({ userId: user.id });

    expect(result).toEqual({ allowed: false });
    expect(mailSender.messages).toHaveLength(0);
    expect(database.tokens.size).toBe(0);
  });

  it('deve recusar um ADMIN PENDING', async () => {
    const admin = User.createAdmin({
      id: 'admin-1',
      name: 'João',
      email: Email.create('joao@example.com'),
      createdById: 'super-1',
    });
    database.users.set(admin.id, admin);

    const result = await sut.execute({ userId: admin.id });

    expect(result).toEqual({ allowed: false });
  });

  it('deve recusar um usuário excluído', async () => {
    const user = createClient();
    user.delete();

    const result = await sut.execute({ userId: user.id });

    expect(result).toEqual({ allowed: false });
  });
});
