import { LoginAttempt } from '../domain/entities/login-attempt.entity';
import { UserToken } from '../domain/entities/user-token.entity';
import { Email } from '../domain/value-objects/email';
import { UserTokenType } from '../domain/value-objects/user-token-type';
import {
  FakeIdentityProvider,
  InMemoryLoginAttemptRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from './in-memory-users';

describe('InMemoryUserTokenRepository', () => {
  let database: InMemoryUsersDatabase;
  let sut: InMemoryUserTokenRepository;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    sut = new InMemoryUserTokenRepository(database);
  });

  describe('findLatest', () => {
    it('deve buscar o token do usuário e do tipo, ignorando os outros', async () => {
      const { token } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });
      await sut.replace(token);
      await sut.replace(UserToken.issueCode({ userId: 'user-2', validForMinutes: 10 }).token);
      await sut.replace(
        UserToken.issue({
          userId: 'user-1',
          type: UserTokenType.PASSWORD_RESET,
          validForMinutes: 60,
        }).token,
      );

      await expect(sut.findLatest('user-1', UserTokenType.LOGIN_CODE)).resolves.toBe(token);
      await expect(sut.findLatest('user-3', UserTokenType.LOGIN_CODE)).resolves.toBeNull();
      await expect(sut.findLatest('user-2', UserTokenType.PASSWORD_RESET)).resolves.toBeNull();
    });

    it('deve devolver o mais recente quando há mais de um', async () => {
      const restore = (id: string, createdAt: string): UserToken =>
        UserToken.restore(id, {
          userId: 'user-1',
          type: UserTokenType.LOGIN_CODE,
          tokenHash: UserToken.hashCode('user-1', id),
          attempts: 0,
          expiresAt: new Date('2026-10-05T12:10:00.000Z'),
          usedAt: null,
          createdAt: new Date(createdAt),
        });
      const older = restore('token-1', '2026-10-05T12:00:00.000Z');
      const newer = restore('token-2', '2026-10-05T12:01:00.000Z');
      database.tokens.set(newer.id, newer);
      database.tokens.set(older.id, older);

      await expect(sut.findLatest('user-1', UserTokenType.LOGIN_CODE)).resolves.toBe(newer);
    });
  });

  describe('saveAttempts', () => {
    it('deve recusar o código certo depois de 5 erros gravados (RN25)', async () => {
      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });
      await sut.replace(token);

      for (let attempt = 1; attempt <= 5; attempt++) {
        token.registerFailedAttempt();
        await sut.saveAttempts(token);
      }

      const found = await sut.findLatest('user-1', UserTokenType.LOGIN_CODE);
      expect(found?.attempts).toBe(5);
      expect(found?.matchesCode(secret)).toBe(true);
      expect(found?.isUsable()).toBe(false);
    });

    it('não deve trazer de volta um código substituído por um reenvio', async () => {
      const first = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 }).token;
      const second = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 }).token;
      await sut.replace(first);
      await sut.replace(second);

      first.registerFailedAttempt();
      await sut.saveAttempts(first);

      expect([...database.tokens.values()]).toEqual([second]);
    });
  });
});

describe('InMemoryLoginAttemptRepository', () => {
  const maria = Email.create('maria@example.com');
  const joao = Email.create('joao@example.com');
  let database: InMemoryUsersDatabase;
  let sut: InMemoryLoginAttemptRepository;

  beforeEach(() => {
    jest.useFakeTimers();
    database = new InMemoryUsersDatabase();
    sut = new InMemoryLoginAttemptRepository(database);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function recordAt(time: string, email: Email, succeeded: boolean): Promise<LoginAttempt> {
    jest.setSystemTime(new Date(`2026-10-06T${time}.000Z`));
    const attempt = LoginAttempt.record({ email, ipAddress: null, userAgent: null, succeeded });
    await sut.save(attempt);

    return attempt;
  }

  describe('countRecentFailures', () => {
    it('deve contar as falhas do e-mail depois da data informada', async () => {
      await recordAt('11:59:59', maria, false);
      await recordAt('12:00:00', maria, false);
      await recordAt('12:01:00', maria, false);
      await recordAt('12:02:00', joao, false);

      const count = await sut.countRecentFailures(maria, new Date('2026-10-06T12:00:00.000Z'));

      expect(count).toBe(1);
    });

    it('deve contar só as falhas depois do último login com sucesso', async () => {
      await recordAt('12:01:00', maria, false);
      await recordAt('12:02:00', maria, true);
      await recordAt('12:03:00', maria, false);
      await recordAt('12:04:00', joao, true);
      await recordAt('12:05:00', maria, false);

      const count = await sut.countRecentFailures(maria, new Date('2026-10-06T12:00:00.000Z'));

      expect(count).toBe(2);
    });
  });

  it('deve apagar só as falhas do e-mail depois da data informada', async () => {
    const old = await recordAt('11:00:00', maria, false);
    const success = await recordAt('12:01:00', maria, true);
    await recordAt('12:02:00', maria, false);
    const other = await recordAt('12:03:00', joao, false);

    await sut.deleteFailuresSince(maria, new Date('2026-10-06T12:00:00.000Z'));

    expect([...database.loginAttempts.values()]).toEqual([old, success, other]);
  });

  it('deve apagar todas as tentativas do e-mail', async () => {
    await recordAt('12:01:00', maria, false);
    await recordAt('12:02:00', maria, true);
    const other = await recordAt('12:03:00', joao, false);

    await sut.deleteByEmail(maria);

    expect([...database.loginAttempts.values()]).toEqual([other]);
  });

  it('deve apagar as tentativas anteriores à data informada, de qualquer e-mail', async () => {
    await recordAt('11:00:00', maria, false);
    await recordAt('11:30:00', joao, true);
    const kept = await recordAt('12:00:00', maria, false);

    await sut.deleteOlderThan(new Date('2026-10-06T12:00:00.000Z'));

    expect([...database.loginAttempts.values()]).toEqual([kept]);
  });
});

describe('FakeIdentityProvider', () => {
  const celular = {
    handle: 'celular',
    createdAt: new Date('2026-10-05T12:00:00.000Z'),
    expiresAt: new Date('2026-10-12T12:00:00.000Z'),
    ipAddress: '203.0.113.10',
    userAgent: 'Mozilla/5.0',
  };
  let sut: FakeIdentityProvider;

  beforeEach(() => {
    sut = new FakeIdentityProvider();
  });

  describe('listSessions', () => {
    it('deve listar as sessões abertas do usuário, ignorando as dos outros', async () => {
      sut.openSession('user-1', celular);
      sut.openSession('user-2', { ...celular, handle: 'de-outro-usuario' });

      await expect(sut.listSessions('user-1')).resolves.toEqual([celular]);
      await expect(sut.listSessions('user-3')).resolves.toEqual([]);
    });

    it('deve listar sem a origem do login a sessão criada só com o handle', async () => {
      sut.sessions.set('user-1', ['antiga']);

      await expect(sut.listSessions('user-1')).resolves.toEqual([
        expect.objectContaining({ handle: 'antiga', ipAddress: null, userAgent: null }),
      ]);
    });

    it('não deve listar as sessões revogadas', async () => {
      sut.openSession('user-1', celular);
      sut.openSession('user-1', { ...celular, handle: 'notebook' });

      await sut.revokeOtherSessions('user-1', 'notebook');

      await expect(sut.listSessions('user-1')).resolves.toEqual([
        expect.objectContaining({ handle: 'notebook' }),
      ]);
    });
  });

  describe('revokeSession', () => {
    it('deve encerrar só a sessão informada', async () => {
      sut.sessions.set('user-1', ['celular', 'notebook']);
      sut.sessions.set('user-2', ['tablet']);

      await sut.revokeSession('celular');

      expect(sut.sessions.get('user-1')).toEqual(['notebook']);
      expect(sut.sessions.get('user-2')).toEqual(['tablet']);
    });

    it('deve ignorar uma sessão que não existe', async () => {
      sut.sessions.set('user-1', ['celular']);

      await expect(sut.revokeSession('inexistente')).resolves.toBeUndefined();
      expect(sut.sessions.get('user-1')).toEqual(['celular']);
    });
  });
});
