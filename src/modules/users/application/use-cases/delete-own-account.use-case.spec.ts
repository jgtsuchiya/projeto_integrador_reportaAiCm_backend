import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { IncorrectPasswordError } from '../../domain/errors/incorrect-password.error';
import { SelfDeletionNotAllowedError } from '../../domain/errors/self-deletion-not-allowed.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';
import {
  FakeIdentityProvider,
  InMemoryClientProfileRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { DeleteOwnAccountUseCase } from './delete-own-account.use-case';

const PASSWORD = 'senha-forte-1';

describe('DeleteOwnAccountUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let sut: DeleteOwnAccountUseCase;
  let client: User;

  beforeEach(async () => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    sut = new DeleteOwnAccountUseCase(userRepository, identityProvider);

    client = await createUser('maria@example.com', (id, email) =>
      User.createClient({ id, name: 'Maria da Silva', email }),
    );
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

  async function createUser(
    address: string,
    build: (id: string, email: Email) => User,
  ): Promise<User> {
    const email = Email.create(address);
    const id = await identityProvider.createCredentials(email, Password.create(PASSWORD));
    const user = build(id, email);
    database.users.set(user.id, user);
    identityProvider.sessions.set(user.id, ['sessao-1']);

    return user;
  }

  it('deve anonimizar o CLIENT e remover o perfil (RN11)', async () => {
    const deleteClient = jest.spyOn(userRepository, 'deleteClient');

    await sut.execute({ userId: client.id, password: PASSWORD });

    expect(deleteClient).toHaveBeenCalledWith(client);
    expect(client.isDeleted).toBe(true);
    expect(client.name).toBe('Usuário excluído');
    expect(client.email.value).toBe(`deleted+${client.id}@reportaai.invalid`);
    expect(database.profiles.has(client.id)).toBe(false);
  });

  it('deve remover o CLIENT do SuperTokens, com as credenciais e as sessões', async () => {
    await sut.execute({ userId: client.id, password: PASSWORD });

    expect(identityProvider.credentials.has(client.id)).toBe(false);
    expect(identityProvider.sessions.has(client.id)).toBe(false);
  });

  it('deve liberar o e-mail e o CPF para um novo cadastro', async () => {
    const profiles = new InMemoryClientProfileRepository(database);

    await sut.execute({ userId: client.id, password: PASSWORD });

    await expect(userRepository.existsByEmail(Email.create('maria@example.com'))).resolves.toBe(
      false,
    );
    await expect(profiles.existsByCpf(Cpf.create('52998224725'))).resolves.toBe(false);
    await expect(
      identityProvider.createCredentials(Email.create('maria@example.com'), Password.random()),
    ).resolves.toEqual(expect.any(String));
  });

  it('deve lançar IncorrectPasswordError sem excluir nada quando a senha não confere', async () => {
    await expect(sut.execute({ userId: client.id, password: 'senha-errada-1' })).rejects.toThrow(
      new IncorrectPasswordError('password'),
    );

    expect(client.isDeleted).toBe(false);
    expect(database.profiles.has(client.id)).toBe(true);
    expect(identityProvider.credentials.has(client.id)).toBe(true);
  });

  it('deve gravar no MySQL antes de remover do SuperTokens', async () => {
    jest.spyOn(userRepository, 'deleteClient').mockRejectedValueOnce(new Error('Falha no MySQL.'));

    await expect(sut.execute({ userId: client.id, password: PASSWORD })).rejects.toThrow(
      'Falha no MySQL.',
    );
    expect(identityProvider.credentials.has(client.id)).toBe(true);
  });

  it.each([
    [
      'ADMIN',
      (id: string, email: Email) =>
        User.createAdmin({ id, name: 'Ana', email, createdById: 'super-1' }),
    ],
    [
      'SUPER_ADMIN',
      (id: string, email: Email) => User.createSuperAdmin({ id, name: 'Super', email }),
    ],
  ])('deve recusar a autoexclusão de um %s (RN15)', async (_role, build) => {
    const user = await createUser('staff@example.com', build);
    const verifyPassword = jest.spyOn(identityProvider, 'verifyPassword');

    await expect(sut.execute({ userId: user.id, password: PASSWORD })).rejects.toThrow(
      SelfDeletionNotAllowedError,
    );
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(user.isDeleted).toBe(false);
    expect(identityProvider.credentials.has(user.id)).toBe(true);
  });

  it('deve lançar UserNotFoundError para uma conta já excluída', async () => {
    await sut.execute({ userId: client.id, password: PASSWORD });

    await expect(sut.execute({ userId: client.id, password: PASSWORD })).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
