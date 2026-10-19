import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyVerifiedError } from '../../domain/errors/email-already-verified.error';
import { EmailRecentlySentError } from '../../domain/errors/email-recently-sent.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import {
  EMAIL_VERIFICATION_MAIL_SUBJECT,
  EmailVerificationService,
} from '../services/email-verification.service';
import { UserMailService } from '../services/user-mail.service';
import { ResendEmailVerificationUseCase } from './resend-email-verification.use-case';

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const EMAIL = 'maria@example.com';

describe('ResendEmailVerificationUseCase', () => {
  let database: InMemoryUsersDatabase;
  let tokenRepository: InMemoryUserTokenRepository;
  let mailSender: FakeMailSender;
  let sut: ResendEmailVerificationUseCase;
  let user: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    tokenRepository = new InMemoryUserTokenRepository(database);
    mailSender = new FakeMailSender();
    sut = new ResendEmailVerificationUseCase(
      new InMemoryUserRepository(database),
      tokenRepository,
      new EmailVerificationService(
        new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
        { expiresInHours: 24 },
      ),
    );

    user = User.createClient({ id: 'client-1', name: 'Maria', email: Email.create(EMAIL) });
    database.users.set(user.id, user);
  });

  /** Segredo do link do último e-mail enviado. */
  function lastSecret(): string {
    const match = /\/verificar-email\?token=([\w-]+)/.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum link de verificação foi enviado.');
    }

    return match[1];
  }

  /** Grava um token da conta emitido há `minutesAgo` minutos, com o segredo informado. */
  function saveToken(type: UserTokenType, minutesAgo: number, secret: string): UserToken {
    const createdAt = new Date(Date.now() - minutesAgo * MINUTE_IN_MS);
    const token = UserToken.restore(`token-${secret}`, {
      userId: user.id,
      type,
      tokenHash: UserToken.hash(secret),
      attempts: 0,
      expiresAt: new Date(createdAt.getTime() + 24 * HOUR_IN_MS),
      usedAt: null,
      createdAt,
    });
    database.tokens.set(token.id, token);

    return token;
  }

  it('deve gravar o token e enviar o link para quem ainda não verificou o e-mail (RN22)', async () => {
    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0]).toMatchObject({
      to: EMAIL,
      subject: EMAIL_VERIFICATION_MAIL_SUBJECT,
    });
    const [token] = [...database.tokens.values()];
    expect(database.tokens.size).toBe(1);
    expect(token.userId).toBe(user.id);
    expect(token.type).toBe(UserTokenType.EMAIL_VERIFICATION);
    expect(token.tokenHash).toBe(UserToken.hash(lastSecret()));
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(24 * HOUR_IN_MS);
    expect(token.isUsable()).toBe(true);
  });

  it('deve invalidar o link anterior', async () => {
    saveToken(UserTokenType.EMAIL_VERIFICATION, 2, 'segredo-antigo');

    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.size).toBe(1);
    await expect(tokenRepository.findByHash(UserToken.hash('segredo-antigo'))).resolves.toBeNull();
    await expect(tokenRepository.findByHash(UserToken.hash(lastSecret()))).resolves.not.toBeNull();
  });

  it('deve manter os tokens de outro tipo da mesma conta', async () => {
    const reset = saveToken(UserTokenType.PASSWORD_RESET, 0, 'segredo-redefinicao');

    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.get(reset.id)).toBe(reset);
    expect(database.tokens.size).toBe(2);
  });

  it('deve recusar o reenvio menos de 1 minuto depois do último e-mail, mantendo o link', async () => {
    const latest = saveToken(UserTokenType.EMAIL_VERIFICATION, 0, 'segredo-recente');

    await expect(sut.execute({ userId: user.id })).rejects.toThrow(EmailRecentlySentError);

    expect(mailSender.messages).toHaveLength(0);
    expect([...database.tokens.values()]).toEqual([latest]);
  });

  it('deve reenviar quando o último e-mail saiu há 1 minuto', async () => {
    saveToken(UserTokenType.EMAIL_VERIFICATION, 1, 'segredo-antigo');

    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
  });

  it('deve recusar o reenvio para quem já verificou o e-mail, mantendo o link', async () => {
    const pending = saveToken(UserTokenType.EMAIL_VERIFICATION, 2, 'segredo-antigo');
    user.verifyEmail();

    await expect(sut.execute({ userId: user.id })).rejects.toThrow(EmailAlreadyVerifiedError);

    expect(mailSender.messages).toHaveLength(0);
    expect([...database.tokens.values()]).toEqual([pending]);
  });

  it('deve recusar o reenvio para o SUPER_ADMIN, que já nasce verificado', async () => {
    const superAdmin = User.createSuperAdmin({
      id: 'super-admin-1',
      name: 'Super Admin',
      email: Email.create('super@example.com'),
    });
    database.users.set(superAdmin.id, superAdmin);

    await expect(sut.execute({ userId: superAdmin.id })).rejects.toThrow(EmailAlreadyVerifiedError);

    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve concluir sem erro e manter o token quando o envio do e-mail falha', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    await expect(sut.execute({ userId: user.id })).resolves.toBeUndefined();

    expect(database.tokens.size).toBe(1);
  });

  it.each([
    ['inexistente', (): void => void database.users.clear()],
    ['excluído', (): void => user.delete()],
  ])('deve lançar UserNotFoundError para um usuário %s', async (_case, arrange) => {
    arrange();

    await expect(sut.execute({ userId: user.id })).rejects.toThrow(UserNotFoundError);

    expect(mailSender.messages).toHaveLength(0);
  });
});
