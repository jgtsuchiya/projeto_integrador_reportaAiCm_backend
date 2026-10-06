import {
  InMemoryLoginAttemptRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import {
  RecordLoginAttemptInput,
  RecordLoginAttemptUseCase,
} from './record-login-attempt.use-case';

describe('RecordLoginAttemptUseCase', () => {
  let database: InMemoryUsersDatabase;
  let sut: RecordLoginAttemptUseCase;

  const input: RecordLoginAttemptInput = {
    email: 'maria@example.com',
    ipAddress: '203.0.113.10',
    userAgent: 'Mozilla/5.0 (Linux; Android 16)',
    succeeded: false,
  };

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    sut = new RecordLoginAttemptUseCase(new InMemoryLoginAttemptRepository(database));
  });

  it('deve registrar a falha com o e-mail, o IP e o user agent (RN19)', async () => {
    await sut.execute(input);

    const [attempt] = [...database.loginAttempts.values()];
    expect(database.loginAttempts.size).toBe(1);
    expect(attempt.email.value).toBe('maria@example.com');
    expect(attempt.ipAddress).toBe('203.0.113.10');
    expect(attempt.userAgent).toBe('Mozilla/5.0 (Linux; Android 16)');
    expect(attempt.succeeded).toBe(false);
    expect(attempt.createdAt).toBeInstanceOf(Date);
  });

  it('deve registrar o login com sucesso', async () => {
    await sut.execute({ ...input, succeeded: true });

    const [attempt] = [...database.loginAttempts.values()];
    expect(attempt.succeeded).toBe(true);
  });

  it('deve registrar o e-mail normalizado, com trim e em minúsculas', async () => {
    await sut.execute({ ...input, email: '  Maria@Example.COM ' });

    const [attempt] = [...database.loginAttempts.values()];
    expect(attempt.email.value).toBe('maria@example.com');
  });

  it('deve registrar a tentativa sem IP e sem user agent', async () => {
    await sut.execute({ ...input, ipAddress: null, userAgent: null });

    const [attempt] = [...database.loginAttempts.values()];
    expect(attempt.ipAddress).toBeNull();
    expect(attempt.userAgent).toBeNull();
  });

  it('não deve registrar a tentativa de um e-mail que a aplicação não aceita', async () => {
    await sut.execute({ ...input, email: `${'a'.repeat(65)}@example.com` });

    expect(database.loginAttempts.size).toBe(0);
  });
});
