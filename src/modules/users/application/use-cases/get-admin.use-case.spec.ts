import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { InMemoryUserRepository, InMemoryUsersDatabase } from '../../testing/in-memory-users';
import { GetAdminUseCase } from './get-admin.use-case';

describe('GetAdminUseCase', () => {
  let database: InMemoryUsersDatabase;
  let sut: GetAdminUseCase;
  let admin: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    sut = new GetAdminUseCase(new InMemoryUserRepository(database));

    admin = User.createAdmin({
      id: 'admin-1',
      name: 'Ana Souza',
      email: Email.create('ana@example.com'),
      createdById: 'super-1',
    });
    database.users.set(admin.id, admin);
  });

  it('deve retornar o ADMIN', async () => {
    const result = await sut.execute({ adminId: admin.id });

    expect(result).toEqual({
      id: 'admin-1',
      role: Role.ADMIN,
      name: 'Ana Souza',
      email: 'ana@example.com',
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdById: 'super-1',
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  });

  it('deve responder que o ADMIN não existe para um id desconhecido ou excluído', async () => {
    await expect(sut.execute({ adminId: 'desconhecido' })).rejects.toThrow(UserNotFoundError);

    admin.delete();
    await expect(sut.execute({ adminId: admin.id })).rejects.toThrow(UserNotFoundError);
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

    await expect(sut.execute({ adminId: user.id })).rejects.toThrow(UserNotFoundError);
  });
});
