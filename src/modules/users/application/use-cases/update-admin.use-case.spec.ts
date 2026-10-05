import { User } from '../../domain/entities/user.entity';
import { InvalidUserNameError } from '../../domain/errors/invalid-user-name.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { InMemoryUserRepository, InMemoryUsersDatabase } from '../../testing/in-memory-users';
import { UpdateAdminUseCase } from './update-admin.use-case';

describe('UpdateAdminUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let sut: UpdateAdminUseCase;
  let admin: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    sut = new UpdateAdminUseCase(userRepository);

    admin = User.createAdmin({
      id: 'admin-1',
      name: 'Ana Souza',
      email: Email.create('ana@example.com'),
      createdById: 'super-1',
    });
    database.users.set(admin.id, admin);
  });

  it('deve renomear o ADMIN e gravar a alteração', async () => {
    const save = jest.spyOn(userRepository, 'save');

    const result = await sut.execute({ adminId: admin.id, name: '  Ana Lima  ' });

    expect(result).toMatchObject({ id: admin.id, name: 'Ana Lima', email: 'ana@example.com' });
    expect(save).toHaveBeenCalledWith(admin);
    expect(database.users.get(admin.id)?.name).toBe('Ana Lima');
  });

  it('deve recusar um nome inválido sem gravar', async () => {
    const save = jest.spyOn(userRepository, 'save');

    await expect(sut.execute({ adminId: admin.id, name: ' ' })).rejects.toThrow(
      InvalidUserNameError,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('deve responder que o ADMIN não existe para o id de outro papel', async () => {
    const client = User.createClient({
      id: 'client-1',
      name: 'Maria',
      email: Email.create('m@x.com'),
    });
    database.users.set(client.id, client);

    await expect(sut.execute({ adminId: client.id, name: 'Outro' })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(client.name).toBe('Maria');
  });
});
