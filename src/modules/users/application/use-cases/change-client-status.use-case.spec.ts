import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { InvalidStatusTransitionError } from '../../domain/errors/invalid-status-transition.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Phone } from '../../domain/value-objects/phone';
import { UserStatus } from '../../domain/value-objects/user-status';
import {
  FakeIdentityProvider,
  InMemoryClientProfileRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { ChangeClientStatusUseCase } from './change-client-status.use-case';

describe('ChangeClientStatusUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let sut: ChangeClientStatusUseCase;
  let client: User;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    sut = new ChangeClientStatusUseCase(
      userRepository,
      new InMemoryClientProfileRepository(database),
      identityProvider,
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

  it('deve inativar o CLIENT e revogar as sessões dele (RN10)', async () => {
    const save = jest.spyOn(userRepository, 'save');
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    const result = await sut.execute({ clientId: client.id, status: UserStatus.INACTIVE });

    expect(result).toMatchObject({
      id: client.id,
      status: UserStatus.INACTIVE,
      cpf: '***.982.247-**',
    });
    expect(save).toHaveBeenCalledWith(client);
    expect(revokeAllSessions).toHaveBeenCalledWith(client.id);
    // O status é gravado antes da revogação: o guard já bloqueia pelo MySQL.
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(
      revokeAllSessions.mock.invocationCallOrder[0],
    );
  });

  it('deve reativar o CLIENT inativado, sem mexer nas sessões', async () => {
    client.deactivate();
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    const result = await sut.execute({ clientId: client.id, status: UserStatus.ACTIVE });

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(database.users.get(client.id)?.status).toBe(UserStatus.ACTIVE);
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it('deve recusar inativar um CLIENT que já está inativo', async () => {
    client.deactivate();
    const save = jest.spyOn(userRepository, 'save');
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    await expect(sut.execute({ clientId: client.id, status: UserStatus.INACTIVE })).rejects.toThrow(
      InvalidStatusTransitionError,
    );
    expect(save).not.toHaveBeenCalled();
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it('deve recusar reativar um CLIENT que já está ativo', async () => {
    await expect(sut.execute({ clientId: client.id, status: UserStatus.ACTIVE })).rejects.toThrow(
      InvalidStatusTransitionError,
    );
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
    const statusBefore = user.status;
    const revokeAllSessions = jest.spyOn(identityProvider, 'revokeAllSessions');

    await expect(sut.execute({ clientId: user.id, status: UserStatus.INACTIVE })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(user.status).toBe(statusBefore);
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });
});
