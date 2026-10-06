import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import {
  PASSWORD_RESET_MAIL_SUBJECT,
  PasswordResetService,
} from '../services/password-reset.service';
import { UserMailService } from '../services/user-mail.service';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';

const MINUTE_IN_MS = 60 * 1000;
const EMAIL = 'maria@example.com';

describe('RequestPasswordResetUseCase', () => {
  let database: InMemoryUsersDatabase;
  let tokenRepository: InMemoryUserTokenRepository;
  let mailSender: FakeMailSender;
  let sut: RequestPasswordResetUseCase;
  let user: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    tokenRepository = new InMemoryUserTokenRepository(database);
    mailSender = new FakeMailSender();
    sut = new RequestPasswordResetUseCase(
      new InMemoryUserRepository(database),
      tokenRepository,
      new PasswordResetService(
        new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
        { expiresInMinutes: 60 },
      ),
    );

    user = User.createClient({ id: 'client-1', name: 'Maria', email: Email.create(EMAIL) });
    database.users.set(user.id, user);
  });

  /** Segredo do link do último e-mail enviado. */
  function lastSecret(): string {
    const match = /\/redefinir-senha\?token=([\w-]+)/.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum link de redefinição foi enviado.');
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
      expiresAt: new Date(createdAt.getTime() + 60 * MINUTE_IN_MS),
      usedAt: null,
      createdAt,
    });
    database.tokens.set(token.id, token);

    return token;
  }

  it('deve gravar o token e enviar o link para a conta ACTIVE (RN20)', async () => {
    await sut.execute({ email: EMAIL });

    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0]).toMatchObject({
      to: EMAIL,
      subject: PASSWORD_RESET_MAIL_SUBJECT,
    });
    const [token] = [...database.tokens.values()];
    expect(database.tokens.size).toBe(1);
    expect(token.userId).toBe(user.id);
    expect(token.type).toBe(UserTokenType.PASSWORD_RESET);
    expect(token.tokenHash).toBe(UserToken.hash(lastSecret()));
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(60 * MINUTE_IN_MS);
    expect(token.isUsable()).toBe(true);
  });

  it('deve encontrar a conta pelo e-mail com maiúsculas e espaços', async () => {
    await sut.execute({ email: '  MARIA@Example.com ' });

    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0].to).toBe(EMAIL);
  });

  it('deve invalidar o link anterior quando um novo é pedido', async () => {
    saveToken(UserTokenType.PASSWORD_RESET, 2, 'segredo-antigo');

    await sut.execute({ email: EMAIL });

    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.size).toBe(1);
    await expect(tokenRepository.findByHash(UserToken.hash('segredo-antigo'))).resolves.toBeNull();
    await expect(tokenRepository.findByHash(UserToken.hash(lastSecret()))).resolves.not.toBeNull();
  });

  it('deve manter os tokens de outro tipo da mesma conta', async () => {
    const verification = saveToken(UserTokenType.EMAIL_VERIFICATION, 0, 'segredo-verificacao');

    await sut.execute({ email: EMAIL });

    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.get(verification.id)).toBe(verification);
    expect(database.tokens.size).toBe(2);
  });

  it('não deve enviar outro e-mail para a mesma conta em menos de 1 minuto', async () => {
    await sut.execute({ email: EMAIL });
    const secret = lastSecret();

    await sut.execute({ email: EMAIL });

    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.size).toBe(1);
    await expect(tokenRepository.findByHash(UserToken.hash(secret))).resolves.not.toBeNull();
  });

  it('deve enviar outro e-mail quando o anterior saiu há 1 minuto', async () => {
    saveToken(UserTokenType.PASSWORD_RESET, 1, 'segredo-antigo');

    await sut.execute({ email: EMAIL });

    expect(mailSender.messages).toHaveLength(1);
  });

  it.each([
    ['sem conta', (): void => void database.users.clear()],
    ['de uma conta INACTIVE', (): void => user.deactivate()],
    ['de uma conta excluída', (): void => user.delete()],
  ])('não deve gravar token nem enviar e-mail para um e-mail %s', async (_case, arrange) => {
    arrange();

    await expect(sut.execute({ email: EMAIL })).resolves.toBeUndefined();

    expect(mailSender.messages).toHaveLength(0);
    expect(database.tokens.size).toBe(0);
  });

  it('não deve enviar o link para o ADMIN PENDING nem invalidar o convite dele', async () => {
    const admin = User.createAdmin({
      id: 'admin-1',
      name: 'Ana',
      email: Email.create('ana@example.com'),
      createdById: 'super-admin-1',
    });
    const invitation = UserToken.issue({
      userId: admin.id,
      type: UserTokenType.INVITATION,
      validForMinutes: 48 * 60,
    }).token;
    database.users.set(admin.id, admin);
    database.tokens.set(invitation.id, invitation);

    await sut.execute({ email: 'ana@example.com' });

    expect(mailSender.messages).toHaveLength(0);
    expect([...database.tokens.values()]).toEqual([invitation]);
  });

  it('deve concluir sem erro e manter o token quando o envio do e-mail falha', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    await expect(sut.execute({ email: EMAIL })).resolves.toBeUndefined();

    expect(database.tokens.size).toBe(1);
  });

  it('deve lançar InvalidEmailError para um e-mail fora do formato', async () => {
    await expect(sut.execute({ email: 'nao-e-um-email' })).rejects.toThrow(InvalidEmailError);
  });
});
