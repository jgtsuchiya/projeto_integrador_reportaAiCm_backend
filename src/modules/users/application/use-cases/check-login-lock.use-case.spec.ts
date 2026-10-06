import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { Email } from '../../domain/value-objects/email';
import {
  InMemoryLoginAttemptRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { LoginLockService } from '../services/login-lock.service';
import { CheckLoginLockUseCase } from './check-login-lock.use-case';

describe('CheckLoginLockUseCase', () => {
  let repository: InMemoryLoginAttemptRepository;
  let sut: CheckLoginLockUseCase;

  beforeEach(() => {
    repository = new InMemoryLoginAttemptRepository(new InMemoryUsersDatabase());
    sut = new CheckLoginLockUseCase(
      new LoginLockService(repository, { maxFailedAttempts: 5, windowMinutes: 15 }),
    );
  });

  async function recordFailures(address: string, times: number): Promise<void> {
    for (let count = 0; count < times; count += 1) {
      await repository.save(
        LoginAttempt.record({
          email: Email.create(address),
          ipAddress: null,
          userAgent: null,
          succeeded: false,
        }),
      );
    }
  }

  it('deve liberar o login de um e-mail abaixo do limite de falhas', async () => {
    await recordFailures('maria@example.com', 4);

    await expect(sut.execute({ email: 'maria@example.com' })).resolves.toEqual({ locked: false });
  });

  it('deve bloquear o login de um e-mail com 5 falhas (RN17)', async () => {
    await recordFailures('maria@example.com', 5);

    await expect(sut.execute({ email: 'maria@example.com' })).resolves.toEqual({ locked: true });
  });

  it('deve tratar o e-mail informado sem diferenciar maiúsculas e espaços', async () => {
    await recordFailures('maria@example.com', 5);

    await expect(sut.execute({ email: ' Maria@Example.com ' })).resolves.toEqual({ locked: true });
  });

  it('não deve bloquear nem consultar as tentativas de um e-mail que a aplicação não aceita', async () => {
    const countRecentFailures = jest.spyOn(repository, 'countRecentFailures');

    const result = await sut.execute({ email: `${'a'.repeat(65)}@example.com` });

    expect(result).toEqual({ locked: false });
    expect(countRecentFailures).not.toHaveBeenCalled();
  });
});
