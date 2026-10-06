import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { Email } from '../../domain/value-objects/email';
import {
  InMemoryLoginAttemptRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { LoginLockService, parseLoginEmail } from './login-lock.service';

const MINUTE_IN_MS = 60 * 1000;

describe('parseLoginEmail', () => {
  it('deve normalizar o e-mail informado no login', () => {
    expect(parseLoginEmail('  Maria@Example.COM ')?.value).toBe('maria@example.com');
  });

  it.each([
    ['maior que 254 caracteres', `${'a'.repeat(64)}@${'b'.repeat(190)}.com`],
    [
      'com espaço na parte local, que o SuperTokens aceita entre aspas',
      '"maria silva"@example.com',
    ],
  ])('deve retornar null para um e-mail %s', (_case, raw) => {
    expect(parseLoginEmail(raw)).toBeNull();
  });
});

describe('LoginLockService', () => {
  const NOW = new Date('2026-10-06T12:00:00.000Z');
  const email = Email.create('maria@example.com');
  let database: InMemoryUsersDatabase;
  let repository: InMemoryLoginAttemptRepository;
  let sut: LoginLockService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    database = new InMemoryUsersDatabase();
    repository = new InMemoryLoginAttemptRepository(database);
    sut = new LoginLockService(repository, { maxFailedAttempts: 5, windowMinutes: 15 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Registra as tentativas com um minuto entre elas, a partir do horário atual do teste. */
  async function record(succeeded: boolean, times = 1, address = email): Promise<void> {
    for (let count = 0; count < times; count += 1) {
      await repository.save(
        LoginAttempt.record({ email: address, ipAddress: null, userAgent: null, succeeded }),
      );
      jest.advanceTimersByTime(MINUTE_IN_MS);
    }
  }

  describe('isLocked', () => {
    it('não deve bloquear um e-mail sem tentativas', async () => {
      await expect(sut.isLocked(email)).resolves.toBe(false);
    });

    it('não deve bloquear antes da 5ª falha', async () => {
      await record(false, 4);

      await expect(sut.isLocked(email)).resolves.toBe(false);
    });

    it('deve bloquear com 5 falhas nos últimos 15 minutos (RN17)', async () => {
      await record(false, 5);

      await expect(sut.isLocked(email)).resolves.toBe(true);
    });

    it('deve liberar o e-mail quando a falha mais antiga sai da janela', async () => {
      await record(false, 5);

      // As falhas foram de 12:00 a 12:04. Às 12:14:59, a primeira ainda está na janela.
      jest.setSystemTime(new Date('2026-10-06T12:14:59.999Z'));
      const beforeWindowEnds = await sut.isLocked(email);
      jest.setSystemTime(new Date('2026-10-06T12:15:00.000Z'));
      const afterWindowEnds = await sut.isLocked(email);

      expect(beforeWindowEnds).toBe(true);
      expect(afterWindowEnds).toBe(false);
    });

    it('deve contar só as falhas depois do último login com sucesso', async () => {
      await record(false, 4);
      await record(true);
      await record(false, 4);

      await expect(sut.isLocked(email)).resolves.toBe(false);
    });

    it('deve bloquear de novo com 5 falhas depois de um login com sucesso', async () => {
      await record(true);
      await record(false, 5);

      await expect(sut.isLocked(email)).resolves.toBe(true);
    });

    it('não deve contar as falhas de outro e-mail', async () => {
      await record(false, 5, Email.create('joao@example.com'));

      await expect(sut.isLocked(email)).resolves.toBe(false);
    });

    it('não deve zerar a conta com o login com sucesso de outro e-mail', async () => {
      await record(false, 5);
      await record(true, 1, Email.create('joao@example.com'));

      await expect(sut.isLocked(email)).resolves.toBe(true);
    });

    it('deve usar o limite e a janela da configuração', async () => {
      sut = new LoginLockService(repository, { maxFailedAttempts: 2, windowMinutes: 1 });
      await repository.save(
        LoginAttempt.record({ email, ipAddress: null, userAgent: null, succeeded: false }),
      );
      await repository.save(
        LoginAttempt.record({ email, ipAddress: null, userAgent: null, succeeded: false }),
      );

      const locked = await sut.isLocked(email);
      jest.advanceTimersByTime(MINUTE_IN_MS);
      const afterWindow = await sut.isLocked(email);

      expect(locked).toBe(true);
      expect(afterWindow).toBe(false);
    });
  });

  describe('clear', () => {
    it('deve zerar o bloqueio do e-mail', async () => {
      await record(false, 5);

      await sut.clear(email);

      await expect(sut.isLocked(email)).resolves.toBe(false);
    });

    it('deve manter os logins com sucesso e as falhas fora da janela, como registro', async () => {
      await record(false, 1);
      jest.setSystemTime(new Date('2026-10-06T13:00:00.000Z'));
      await record(true);
      await record(false, 2);

      await sut.clear(email);

      const kept = [...database.loginAttempts.values()];
      expect(kept.map((attempt) => attempt.succeeded)).toEqual([false, true]);
      expect(kept[0].createdAt).toEqual(NOW);
    });

    it('não deve zerar o bloqueio de outro e-mail', async () => {
      const other = Email.create('joao@example.com');
      await record(false, 5, other);

      await sut.clear(email);

      await expect(sut.isLocked(other)).resolves.toBe(true);
    });
  });
});
