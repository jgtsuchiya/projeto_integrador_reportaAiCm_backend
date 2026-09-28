import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { InMemoryUserRepository, InMemoryUsersDatabase } from '../../testing/in-memory-users';
import { ListAdminsUseCase } from './list-admins.use-case';

describe('ListAdminsUseCase', () => {
  let database: InMemoryUsersDatabase;
  let sut: ListAdminsUseCase;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    sut = new ListAdminsUseCase(new InMemoryUserRepository(database));
  });

  function addAdmin(id: string, createdAt: Date): User {
    const admin = User.restore(id, {
      role: Role.ADMIN,
      name: `Admin ${id}`,
      email: Email.create(`${id}@example.com`),
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
      mfaEnabled: false,
      lastLoginAt: null,
      createdById: 'super-1',
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
    database.users.set(admin.id, admin);

    return admin;
  }

  function addUser(user: User): void {
    database.users.set(user.id, user);
  }

  it('deve listar só os ADMINs, dos mais recentes para os mais antigos', async () => {
    addAdmin('admin-1', new Date('2026-09-01T00:00:00.000Z'));
    addAdmin('admin-2', new Date('2026-09-02T00:00:00.000Z'));
    addUser(User.createClient({ id: 'client-1', name: 'Maria', email: Email.create('m@x.com') }));
    addUser(
      User.createSuperAdmin({ id: 'super-1', name: 'Super', email: Email.create('s@x.com') }),
    );

    const result = await sut.execute({ page: 1, pageSize: 20 });

    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(result.items.map(({ id }) => id)).toEqual(['admin-2', 'admin-1']);
    expect(result.items[0]).toEqual({
      id: 'admin-2',
      role: 'ADMIN',
      name: 'Admin admin-2',
      email: 'admin-2@example.com',
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdById: 'super-1',
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
  });

  it('deve filtrar pelo status', async () => {
    addAdmin('admin-1', new Date('2026-09-01T00:00:00.000Z'));
    addAdmin('admin-2', new Date('2026-09-02T00:00:00.000Z')).acceptInvitation();

    const result = await sut.execute({ page: 1, pageSize: 20, status: UserStatus.ACTIVE });

    expect(result.total).toBe(1);
    expect(result.items.map(({ id }) => id)).toEqual(['admin-2']);
  });

  it('deve paginar o resultado', async () => {
    for (let day = 1; day <= 5; day++) {
      addAdmin(`admin-${day}`, new Date(`2026-09-0${day}T00:00:00.000Z`));
    }

    const result = await sut.execute({ page: 2, pageSize: 2 });

    expect(result).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(result.items.map(({ id }) => id)).toEqual(['admin-3', 'admin-2']);
  });

  it('não deve listar os ADMINs excluídos', async () => {
    addAdmin('admin-1', new Date('2026-09-01T00:00:00.000Z')).delete();

    const result = await sut.execute({ page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });
});
