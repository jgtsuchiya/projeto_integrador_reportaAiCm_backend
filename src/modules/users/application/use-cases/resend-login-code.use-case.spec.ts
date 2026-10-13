import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailRecentlySentError } from '../../domain/errors/email-recently-sent.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { LOGIN_CODE_MAIL_SUBJECT, LoginCodeService } from '../services/login-code.service';
import { UserMailService } from '../services/user-mail.service';
import { ResendLoginCodeUseCase } from './resend-login-code.use-case';

const MINUTE_IN_MS = 60 * 1000;
const EMAIL = 'maria@example.com';

describe('ResendLoginCodeUseCase', () => {
  let database: InMemoryUsersDatabase;
  let mailSender: FakeMailSender;
  let sut: ResendLoginCodeUseCase;
  let user: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    mailSender = new FakeMailSender();
    sut = new ResendLoginCodeUseCase(
      new InMemoryUserRepository(database),
      new LoginCodeService(
        new InMemoryUserTokenRepository(database),
        new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
        { expiresInMinutes: 10 },
      ),
    );

    user = User.createClient({ id: 'client-1', name: 'Maria', email: Email.create(EMAIL) });
    database.users.set(user.id, user);
  });

  /** Código do último e-mail enviado. */
  function lastCode(): string {
    const match = /^\d{6}$/m.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum código foi enviado.');
    }

    return match[0];
  }

  /** Grava um código da conta, com o valor informado, emitido há `minutesAgo` minutos. */
  function saveCode(code: string, minutesAgo: number): UserToken {
    const createdAt = new Date(Date.now() - minutesAgo * MINUTE_IN_MS);
    const token = UserToken.restore(`token-${code}`, {
      userId: user.id,
      type: UserTokenType.LOGIN_CODE,
      tokenHash: UserToken.hashCode(user.id, code),
      attempts: 0,
      expiresAt: new Date(createdAt.getTime() + 10 * MINUTE_IN_MS),
      usedAt: null,
      createdAt,
    });
    database.tokens.set(token.id, token);

    return token;
  }

  it('deve gravar um código novo e enviá-lo por e-mail (RN25)', async () => {
    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0]).toMatchObject({ to: EMAIL, subject: LOGIN_CODE_MAIL_SUBJECT });
    const [token] = [...database.tokens.values()];
    expect(database.tokens.size).toBe(1);
    expect(token.type).toBe(UserTokenType.LOGIN_CODE);
    expect(token.matchesCode(lastCode())).toBe(true);
  });

  it('deve invalidar o código anterior', async () => {
    const old = saveCode('111111', 2);

    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.size).toBe(1);
    expect(database.tokens.has(old.id)).toBe(false);
  });

  it('deve recusar o reenvio menos de 1 minuto depois do último código, mantendo o código', async () => {
    const latest = saveCode('111111', 0);

    await expect(sut.execute({ userId: user.id })).rejects.toThrow(EmailRecentlySentError);

    expect(mailSender.messages).toHaveLength(0);
    expect([...database.tokens.values()]).toEqual([latest]);
  });

  it('deve reenviar quando o último código saiu há 1 minuto', async () => {
    saveCode('111111', 1);

    await sut.execute({ userId: user.id });

    expect(mailSender.messages).toHaveLength(1);
  });

  it('deve concluir sem erro e manter o código quando o envio do e-mail falha', async () => {
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
