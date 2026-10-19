import { UserToken } from '../domain/entities/user-token.entity';
import { UserTokenType } from '../domain/value-objects/user-token-type';
import { InMemoryUsersDatabase, InMemoryUserTokenRepository } from './in-memory-users';

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
