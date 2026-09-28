import { User } from '../../domain/entities/user.entity';
import { InvalidStatusTransitionError } from '../../domain/errors/invalid-status-transition.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { UserStatus } from '../../domain/value-objects/user-status';
import {
  FakeIdentityProvider,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { ChangeAdminStatusUseCase } from './change-admin-status.use-case';

describe('ChangeAdminStatusUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let sut: ChangeAdminStatusUseCase;
  let admin: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    sut = new ChangeAdminStatusUseCase(userRepository, identityProvider);

    admin = User.createAdmin({
      id: 'admin-1',
      name: 'Ana Souza',
      email: Email.create('ana@example.com'),
      createdById: 'super-1',
    });
    admin.acceptInvitation();
    database.users.set(admin.id, admin);
  });

  it('deve inativar o ADMIN e revogar as sessões dele (RN10)', async () => {
    const save = jest.spyOn(userRepository, 'save');
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    const result = await sut.execute({ adminId: admin.id, status: UserStatus.INACTIVE });

    expect(result).toMatchObject({ id: admin.id, status: UserStatus.INACTIVE });
    expect(save).toHaveBeenCalledWith(admin);
    expect(revokeAllSessions).toHaveBeenCalledWith(admin.id);
    // O status é gravado antes da revogação: o guard já bloqueia pelo MySQL.
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(
      revokeAllSessions.mock.invocationCallOrder[0],
    );
  });

  it('deve reativar o ADMIN inativado, sem mexer nas sessões', async () => {
    admin.deactivate();
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    const result = await sut.execute({ adminId: admin.id, status: UserStatus.ACTIVE });

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(database.users.get(admin.id)?.status).toBe(UserStatus.ACTIVE);
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it.each([UserStatus.ACTIVE, UserStatus.INACTIVE] as const)(
    'deve recusar a mudança de um ADMIN PENDING para %s',
    async (status) => {
      const pending = User.createAdmin({
        id: 'admin-2',
        name: 'Bia',
        email: Email.create('bia@example.com'),
        createdById: 'super-1',
      });
      database.users.set(pending.id, pending);
      const save = jest.spyOn(userRepository, 'save');

      await expect(sut.execute({ adminId: pending.id, status })).rejects.toThrow(
        InvalidStatusTransitionError,
      );
      expect(pending.status).toBe(UserStatus.PENDING);
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('deve recusar inativar um ADMIN que já está inativo', async () => {
    admin.deactivate();
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    await expect(sut.execute({ adminId: admin.id, status: UserStatus.INACTIVE })).rejects.toThrow(
      InvalidStatusTransitionError,
    );
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it.each([
    [
      'CLIENT',
      User.createClient({ id: 'client-1', name: 'Maria', email: Email.create('m@x.com') }),
    ],
    [
      'SUPER_ADMIN',
      User.createSuperAdmin({ id: 'super-1', name: 'Super', email: Email.create('s@x.com') }),
    ],
  ])('deve responder que o ADMIN não existe para o id de um %s', async (_role, user) => {
    database.users.set(user.id, user);

    await expect(sut.execute({ adminId: user.id, status: UserStatus.INACTIVE })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(user.status).toBe(UserStatus.ACTIVE);
  });
});
