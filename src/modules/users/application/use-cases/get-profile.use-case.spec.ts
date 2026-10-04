import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Phone } from '../../domain/value-objects/phone';
import {
  InMemoryClientProfileRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { GetProfileUseCase } from './get-profile.use-case';

describe('GetProfileUseCase', () => {
  let database: InMemoryUsersDatabase;
  let sut: GetProfileUseCase;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    sut = new GetProfileUseCase(
      new InMemoryUserRepository(database),
      new InMemoryClientProfileRepository(database),
    );
  });

  it('deve retornar o CLIENT com o perfil completo, com o CPF sem máscara', async () => {
    const client = User.createClient({
      id: 'client-1',
      name: 'Maria da Silva',
      email: Email.create('maria@example.com'),
    });
    const profile = ClientProfile.create({
      userId: client.id,
      cpf: Cpf.create('529.982.247-25'),
      phone: Phone.create('(43) 99999-8888'),
      birthDate: BirthDate.create('1990-05-20'),
    });
    database.users.set(client.id, client);
    database.profiles.set(client.id, profile);

    const result = await sut.execute({ userId: client.id });

    expect(result).toEqual({
      id: 'client-1',
      role: 'CLIENT',
      name: 'Maria da Silva',
      email: 'maria@example.com',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: client.createdAt,
      // O perfil é criado depois do usuário, então é a alteração mais recente.
      updatedAt: profile.updatedAt,
      cpf: '52998224725',
      phone: '43999998888',
      birthDate: '1990-05-20',
    });
  });

  it.each([
    [
      'ADMIN',
      User.createAdmin({
        id: 'admin-1',
        name: 'Ana Souza',
        email: Email.create('ana@example.com'),
        createdById: 'super-1',
      }),
    ],
    [
      'SUPER_ADMIN',
      User.createSuperAdmin({
        id: 'super-1',
        name: 'Super Admin',
        email: Email.create('super@example.com'),
      }),
    ],
  ])('deve retornar o %s sem os campos do perfil do CLIENT', async (role, user) => {
    database.users.set(user.id, user);

    const result = await sut.execute({ userId: user.id });

    expect(result).toMatchObject({ id: user.id, role, email: user.email.value });
    expect(result).not.toHaveProperty('cpf');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('birthDate');
  });

  it('deve lançar UserNotFoundError para um usuário excluído', async () => {
    const client = User.createClient({
      id: 'client-1',
      name: 'Maria',
      email: Email.create('maria@example.com'),
    });
    client.delete();
    database.users.set(client.id, client);

    await expect(sut.execute({ userId: client.id })).rejects.toThrow(UserNotFoundError);
  });

  it('deve falhar quando o CLIENT não tem perfil', async () => {
    const client = User.createClient({
      id: 'client-1',
      name: 'Maria',
      email: Email.create('maria@example.com'),
    });
    database.users.set(client.id, client);

    await expect(sut.execute({ userId: client.id })).rejects.toThrow(
      'O CLIENT client-1 não tem perfil.',
    );
  });
});
