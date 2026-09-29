import { User } from '../../domain/entities/user.entity';
import { IncorrectPasswordError } from '../../domain/errors/incorrect-password.error';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import {
  FakeIdentityProvider,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { ChangePasswordUseCase } from './change-password.use-case';

const CURRENT_PASSWORD = 'senha-antiga-1';
const NEW_PASSWORD = 'senha-nova-2';

describe('ChangePasswordUseCase', () => {
  let database: InMemoryUsersDatabase;
  let identityProvider: FakeIdentityProvider;
  let sut: ChangePasswordUseCase;
  let user: User;

  beforeEach(async () => {
    database = new InMemoryUsersDatabase();
    identityProvider = new FakeIdentityProvider();
    sut = new ChangePasswordUseCase(new InMemoryUserRepository(database), identityProvider);

    const email = Email.create('maria@example.com');
    const id = await identityProvider.createCredentials(email, Password.create(CURRENT_PASSWORD));
    user = User.createClient({ id, name: 'Maria', email });
    database.users.set(user.id, user);
    identityProvider.sessions.set(user.id, ['atual', 'celular', 'notebook']);
  });

  it('deve gravar a nova senha e revogar as outras sessões, mantendo a atual (RN13)', async () => {
    await sut.execute({
      userId: user.id,
      sessionHandle: 'atual',
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(identityProvider.credentials.get(user.id)?.password).toBe(NEW_PASSWORD);
    expect(identityProvider.sessions.get(user.id)).toEqual(['atual']);
  });

  it('deve lançar IncorrectPasswordError quando a senha atual não confere', async () => {
    await expect(
      sut.execute({
        userId: user.id,
        sessionHandle: 'atual',
        currentPassword: 'senha-errada-1',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow(new IncorrectPasswordError('currentPassword'));

    expect(identityProvider.credentials.get(user.id)?.password).toBe(CURRENT_PASSWORD);
    expect(identityProvider.sessions.get(user.id)).toHaveLength(3);
  });

  it('deve aplicar a política de senha na nova senha (RN08)', async () => {
    const verifyPassword = jest.spyOn(identityProvider, 'verifyPassword');

    await expect(
      sut.execute({
        userId: user.id,
        sessionHandle: 'atual',
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'curta1',
      }),
    ).rejects.toThrow(InvalidPasswordError);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('deve lançar UserNotFoundError para um usuário excluído', async () => {
    user.delete();

    await expect(
      sut.execute({
        userId: user.id,
        sessionHandle: 'atual',
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
