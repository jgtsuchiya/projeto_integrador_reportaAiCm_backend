import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { Email } from '../../domain/value-objects/email';
import {
  InMemoryLoginAttemptRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { PurgeLoginAttemptsUseCase } from './purge-login-attempts.use-case';

describe('PurgeLoginAttemptsUseCase', () => {
  let database: InMemoryUsersDatabase;
  let repository: InMemoryLoginAttemptRepository;
  let sut: PurgeLoginAttemptsUseCase;

  beforeEach(() => {
    jest.useFakeTimers();
    database = new InMemoryUsersDatabase();
    repository = new InMemoryLoginAttemptRepository(database);
    sut = new PurgeLoginAttemptsUseCase(repository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function recordAt(date: string, succeeded: boolean): Promise<LoginAttempt> {
    jest.setSystemTime(new Date(date));
    const attempt = LoginAttempt.record({
      email: Email.create('maria@example.com'),
      ipAddress: '203.0.113.10',
      userAgent: null,
      succeeded,
    });
    await repository.save(attempt);

    return attempt;
  }

  it('deve apagar as tentativas com mais de 30 dias e manter as outras (RN19)', async () => {
    await recordAt('2026-09-01T12:00:00.000Z', false);
    await recordAt('2026-09-06T11:59:59.999Z', true);
    const onTheLimit = await recordAt('2026-09-06T12:00:00.000Z', false);
    const recent = await recordAt('2026-10-06T11:00:00.000Z', true);
    jest.setSystemTime(new Date('2026-10-06T12:00:00.000Z'));

    await sut.execute();

    expect([...database.loginAttempts.values()]).toEqual([onTheLimit, recent]);
  });

  it('não deve apagar nada quando todas as tentativas estão dentro do prazo', async () => {
    await recordAt('2026-10-01T12:00:00.000Z', false);
    jest.setSystemTime(new Date('2026-10-06T12:00:00.000Z'));

    await sut.execute();

    expect(database.loginAttempts.size).toBe(1);
  });
});
