import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Phone } from '../../domain/value-objects/phone';
import { UserStatus } from '../../domain/value-objects/user-status';
import {
  InMemoryClientProfileRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { GetClientUseCase } from './get-client.use-case';

describe('GetClientUseCase', () => {
  let database: InMemoryUsersDatabase;
  let sut: GetClientUseCase;
  let client: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    sut = new GetClientUseCase(
      new InMemoryUserRepository(database),
      new InMemoryClientProfileRepository(database),
    );

    client = User.createClient({
      id: 'client-1',
      name: 'Maria da Silva',
      email: Email.create('maria@example.com'),
    });
    database.users.set(client.id, client);
    database.profiles.set(
      client.id,
      ClientProfile.create({
        userId: client.id,
        cpf: Cpf.create('529.982.247-25'),
        phone: Phone.create('(43) 99999-8888'),
        birthDate: BirthDate.create('1990-05-20'),
      }),
    );
  });

  it('deve retornar o CLIENT com o CPF mascarado (RN12)', async () => {
    const result = await sut.execute({ clientId: client.id });

    expect(result).toEqual({
      id: client.id,
      role: 'CLIENT',
      name: 'Maria da Silva',
      email: 'maria@example.com',
      status: UserStatus.ACTIVE,
      cpf: '***.982.247-**',
      phone: '43999998888',
      birthDate: '1990-05-20',
      lastLoginAt: null,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    });
    expect(JSON.stringify(result)).not.toContain('52998224725');
  });

  it.each([
    [
      'ADMIN',
      User.createAdmin({
        id: 'admin-1',
        name: 'Ana',
        email: Email.create('a@x.com'),
        createdById: 'super-1',
      }),
    ],
    [
      'SUPER_ADMIN',
      User.createSuperAdmin({ id: 'super-1', name: 'Super', email: Email.create('s@x.com') }),
    ],
  ])('deve responder que o CLIENT não existe para o id de um %s', async (_role, user) => {
    database.users.set(user.id, user);

    await expect(sut.execute({ clientId: user.id })).rejects.toThrow(UserNotFoundError);
  });

  it('deve responder que o CLIENT não existe para um id inexistente ou excluído', async () => {
    client.delete();

    await expect(sut.execute({ clientId: client.id })).rejects.toThrow(UserNotFoundError);
    await expect(sut.execute({ clientId: 'client-2' })).rejects.toThrow(UserNotFoundError);
  });

  it('deve falhar quando o CLIENT não tem perfil, porque o dado está inconsistente', async () => {
    database.profiles.delete(client.id);

    await expect(sut.execute({ clientId: client.id })).rejects.toThrow(
      'O CLIENT client-1 não tem perfil.',
    );
  });
});
