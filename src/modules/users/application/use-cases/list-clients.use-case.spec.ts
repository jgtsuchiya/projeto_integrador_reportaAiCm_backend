import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Phone } from '../../domain/value-objects/phone';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { InMemoryUserRepository, InMemoryUsersDatabase } from '../../testing/in-memory-users';
import { ListClientsUseCase } from './list-clients.use-case';

describe('ListClientsUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let sut: ListClientsUseCase;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    sut = new ListClientsUseCase(userRepository);
  });

  function addClient(
    id: string,
    createdAt: Date,
    { name = `Cliente ${id}`, cpf = '529.982.247-25' }: { name?: string; cpf?: string } = {},
  ): User {
    const client = User.restore(id, {
      role: Role.CLIENT,
      name,
      email: Email.create(`${id}@example.com`),
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      mfaEnabled: false,
      lastLoginAt: null,
      createdById: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
    database.users.set(client.id, client);
    database.profiles.set(
      client.id,
      ClientProfile.create({
        userId: client.id,
        cpf: Cpf.create(cpf),
        phone: Phone.create('(43) 99999-8888'),
        birthDate: BirthDate.create('1990-05-20'),
      }),
    );

    return client;
  }

  it('deve listar só os CLIENTs, dos mais recentes para os mais antigos, com o CPF mascarado', async () => {
    addClient('client-1', new Date('2026-09-01T00:00:00.000Z'));
    addClient('client-2', new Date('2026-09-02T00:00:00.000Z'), { cpf: '111.444.777-35' });
    database.users.set(
      'admin-1',
      User.createAdmin({
        id: 'admin-1',
        name: 'Ana',
        email: Email.create('a@x.com'),
        createdById: 'super-1',
      }),
    );

    const result = await sut.execute({ page: 1, pageSize: 20 });

    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(result.items.map(({ id }) => id)).toEqual(['client-2', 'client-1']);
    expect(result.items[0]).toEqual({
      id: 'client-2',
      role: 'CLIENT',
      name: 'Cliente client-2',
      email: 'client-2@example.com',
      status: UserStatus.ACTIVE,
      cpf: '***.444.777-**',
      phone: '43999998888',
      birthDate: '1990-05-20',
      lastLoginAt: null,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
  });

  it('deve filtrar pelo status', async () => {
    addClient('client-1', new Date('2026-09-01T00:00:00.000Z'));
    addClient('client-2', new Date('2026-09-02T00:00:00.000Z')).deactivate();

    const result = await sut.execute({ page: 1, pageSize: 20, status: UserStatus.INACTIVE });

    expect(result.total).toBe(1);
    expect(result.items.map(({ id }) => id)).toEqual(['client-2']);
  });

  it('deve buscar um trecho do nome ou do e-mail', async () => {
    const findClientPage = jest.spyOn(userRepository, 'findClientPage');
    addClient('client-1', new Date('2026-09-01T00:00:00.000Z'), { name: 'Maria da Silva' });
    addClient('client-2', new Date('2026-09-02T00:00:00.000Z'), { name: 'João Souza' });

    const byName = await sut.execute({ page: 1, pageSize: 20, search: 'maria' });
    const byEmail = await sut.execute({ page: 1, pageSize: 20, search: 'client-2@' });

    expect(byName.items.map(({ id }) => id)).toEqual(['client-1']);
    expect(byEmail.items.map(({ id }) => id)).toEqual(['client-2']);
    expect(findClientPage).toHaveBeenCalledWith(
      { status: undefined, text: 'maria' },
      { page: 1, pageSize: 20 },
    );
  });

  it.each(['529.982.247-25', '52998224725'])(
    'deve buscar pelo CPF exato quando a busca é um CPF válido (%s)',
    async (search) => {
      const findClientPage = jest.spyOn(userRepository, 'findClientPage');
      addClient('client-1', new Date('2026-09-01T00:00:00.000Z'));
      addClient('client-2', new Date('2026-09-02T00:00:00.000Z'), { cpf: '111.444.777-35' });

      const result = await sut.execute({
        page: 1,
        pageSize: 20,
        status: UserStatus.ACTIVE,
        search,
      });

      expect(result.items.map(({ id }) => id)).toEqual(['client-1']);
      expect(findClientPage).toHaveBeenCalledWith(
        { status: UserStatus.ACTIVE, cpf: Cpf.create('52998224725') },
        { page: 1, pageSize: 20 },
      );
    },
  );

  it('não deve buscar um trecho do CPF, para não revelar os dígitos mascarados (RN12)', async () => {
    addClient('client-1', new Date('2026-09-01T00:00:00.000Z'));

    const result = await sut.execute({ page: 1, pageSize: 20, search: '529982' });

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it('deve paginar o resultado', async () => {
    for (let day = 1; day <= 5; day++) {
      addClient(`client-${day}`, new Date(`2026-09-0${day}T00:00:00.000Z`));
    }

    const result = await sut.execute({ page: 2, pageSize: 2 });

    expect(result).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(result.items.map(({ id }) => id)).toEqual(['client-3', 'client-2']);
  });

  it('não deve listar os CLIENTs excluídos', async () => {
    addClient('client-1', new Date('2026-09-01T00:00:00.000Z')).delete();

    const result = await sut.execute({ page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });
});
