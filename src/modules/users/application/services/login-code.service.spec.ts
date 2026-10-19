import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { InMemoryUsersDatabase, InMemoryUserTokenRepository } from '../../testing/in-memory-users';
import { LOGIN_CODE_MAIL_SUBJECT, LoginCodeService } from './login-code.service';
import { UserMailService } from './user-mail.service';

const MINUTE_IN_MS = 60 * 1000;

describe('LoginCodeService', () => {
  const user = User.createClient({
    id: 'client-1',
    name: 'Maria <Silva>',
    email: Email.create('maria@example.com'),
  });
  let database: InMemoryUsersDatabase;
  let mailSender: FakeMailSender;
  let sut: LoginCodeService;

  function createService(expiresInMinutes: number): LoginCodeService {
    return new LoginCodeService(
      new InMemoryUserTokenRepository(database),
      new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
      { expiresInMinutes },
    );
  }

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    mailSender = new FakeMailSender();
    sut = createService(10);
  });

  /** Código do último e-mail enviado, que fica sozinho numa linha do texto. */
  function lastCode(): string {
    const match = /^\d{6}$/m.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum código foi enviado.');
    }

    return match[0];
  }

  /** Grava um código da conta emitido há `secondsAgo` segundos. */
  function saveCode(
    secondsAgo: number,
    props: { usedAt?: Date; attempts?: number } = {},
  ): UserToken {
    const createdAt = new Date(Date.now() - secondsAgo * 1000);
    const token = UserToken.restore(`token-${database.tokens.size + 1}`, {
      userId: user.id,
      type: UserTokenType.LOGIN_CODE,
      tokenHash: UserToken.hashCode(user.id, '000000'),
      attempts: props.attempts ?? 0,
      expiresAt: new Date(createdAt.getTime() + 10 * MINUTE_IN_MS),
      usedAt: props.usedAt ?? null,
      createdAt,
    });
    database.tokens.set(token.id, token);

    return token;
  }

  it('deve gravar um código de 6 dígitos com a validade configurada e enviá-lo por e-mail (RN25)', async () => {
    const sent = await sut.send(user);

    expect(sent).toBe(true);
    expect(mailSender.messages).toHaveLength(1);
    const [message] = mailSender.messages;
    const code = lastCode();
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe(LOGIN_CODE_MAIL_SUBJECT);
    expect(message.text).toContain('Olá, Maria <Silva>!');
    expect(message.text).toContain('O código vale por 10 minutos e só pode ser usado uma vez.');
    expect(message.html).toContain(`>${code}</p>`);
    expect(message.html).toContain('Olá, Maria &lt;Silva&gt;!');
    const [token] = [...database.tokens.values()];
    expect(database.tokens.size).toBe(1);
    expect(token.userId).toBe(user.id);
    expect(token.type).toBe(UserTokenType.LOGIN_CODE);
    expect(token.attempts).toBe(0);
    expect(token.matchesCode(code)).toBe(true);
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(10 * MINUTE_IN_MS);
  });

  it('não deve gravar o código em texto puro nem colocá-lo no assunto do e-mail', async () => {
    await sut.send(user);

    const code = lastCode();
    const [token] = [...database.tokens.values()];
    expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.tokenHash).not.toContain(code);
    expect(mailSender.messages[0].subject).not.toContain(code);
  });

  it('deve escrever a validade de 1 minuto no singular', async () => {
    sut = createService(1);

    await sut.send(user);

    expect(mailSender.messages[0].text).toContain('O código vale por 1 minuto ');
  });

  it('deve substituir o código anterior, zerando os erros', async () => {
    const old = saveCode(60, { attempts: 5 });

    const sent = await sut.send(user);

    expect(sent).toBe(true);
    const [token] = [...database.tokens.values()];
    expect(database.tokens.size).toBe(1);
    expect(token.equals(old)).toBe(false);
    expect(token.attempts).toBe(0);
    expect(token.matchesCode(lastCode())).toBe(true);
  });

  it('deve manter os tokens de outro tipo da mesma conta', async () => {
    const reset = UserToken.issue({
      userId: user.id,
      type: UserTokenType.PASSWORD_RESET,
      validForMinutes: 60,
    }).token;
    database.tokens.set(reset.id, reset);

    await sut.send(user);

    expect(database.tokens.get(reset.id)).toBe(reset);
    expect(database.tokens.size).toBe(2);
  });

  it.each([
    ['ainda válido', {}],
    ['já com o limite de erros', { attempts: 5 }],
  ])(
    'não deve emitir outro código menos de 1 minuto depois do anterior, %s',
    async (_case, props) => {
      const latest = saveCode(59, props);

      const sent = await sut.send(user);

      expect(sent).toBe(false);
      expect(mailSender.messages).toHaveLength(0);
      expect([...database.tokens.values()]).toEqual([latest]);
    },
  );

  it('deve emitir outro código logo depois de o anterior ser usado', async () => {
    saveCode(5, { usedAt: new Date() });

    const sent = await sut.send(user);

    expect(sent).toBe(true);
    expect(mailSender.messages).toHaveLength(1);
    expect(database.tokens.size).toBe(1);
  });

  it('deve considerar só os códigos da própria conta no intervalo', async () => {
    const other = UserToken.issueCode({ userId: 'client-2', validForMinutes: 10 }).token;
    database.tokens.set(other.id, other);

    const sent = await sut.send(user);

    expect(sent).toBe(true);
    expect(database.tokens.get(other.id)).toBe(other);
  });

  it('deve manter o código gravado e responder true quando o servidor de e-mail recusa a mensagem', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    await expect(sut.send(user)).resolves.toBe(true);

    expect(database.tokens.size).toBe(1);
  });

  it('deve repassar um erro que não seja de envio', async () => {
    const failure = new Error('Bug no template.');
    jest.spyOn(mailSender, 'send').mockRejectedValue(failure);

    await expect(sut.send(user)).rejects.toBe(failure);
  });
});
