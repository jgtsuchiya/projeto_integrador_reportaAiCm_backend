import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailNotVerifiedError } from '../../domain/errors/email-not-verified.error';
import { IncorrectPasswordError } from '../../domain/errors/incorrect-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';
import type { ProfileOutput } from '../dtos/profile.output';
import {
  FakeIdentityProvider,
  InMemoryClientProfileRepository,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { ChangeMfaUseCase } from './change-mfa.use-case';

const PASSWORD = 'senha-forte-1';
const SESSIONS = ['atual', 'celular', 'notebook'];

describe('ChangeMfaUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let sut: ChangeMfaUseCase;
  let admin: User;

  beforeEach(async () => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    sut = new ChangeMfaUseCase(
      userRepository,
      new InMemoryClientProfileRepository(database),
      identityProvider,
    );

    // O ADMIN fica com o e-mail verificado no aceite do convite (RN06).
    admin = await createUser('ana@example.com', (id, email) =>
      User.createAdmin({ id, name: 'Ana Souza', email, createdById: 'super-1' }),
    );
    admin.acceptInvitation();
  });

  async function createUser(
    address: string,
    build: (id: string, email: Email) => User,
  ): Promise<User> {
    const email = Email.create(address);
    const id = await identityProvider.createCredentials(email, Password.create(PASSWORD));
    const user = build(id, email);
    database.users.set(user.id, user);
    identityProvider.sessions.set(user.id, [...SESSIONS]);

    return user;
  }

  /** CLIENT do autocadastro, que nasce com o e-mail não verificado (RN22). */
  async function createClient(): Promise<{ client: User; profile: ClientProfile }> {
    const client = await createUser('maria@example.com', (id, email) =>
      User.createClient({ id, name: 'Maria da Silva', email }),
    );
    const profile = ClientProfile.create({
      userId: client.id,
      cpf: Cpf.create('529.982.247-25'),
      phone: Phone.create('(43) 99999-8888'),
      birthDate: BirthDate.create('1990-05-20'),
    });
    database.profiles.set(client.id, profile);

    return { client, profile };
  }

  function execute(user: User, enabled: boolean, password = PASSWORD): Promise<ProfileOutput> {
    return sut.execute({ userId: user.id, sessionHandle: 'atual', enabled, password });
  }

  describe('ao ativar', () => {
    it('deve gravar o mfa_enabled e responder o perfil atualizado (RN24)', async () => {
      const save = jest.spyOn(userRepository, 'save');

      const result = await execute(admin, true);

      expect(save).toHaveBeenCalledWith(admin);
      expect(admin.mfaEnabled).toBe(true);
      expect(result).toMatchObject({ id: admin.id, role: 'ADMIN', mfaEnabled: true });
    });

    it('deve revogar as outras sessões e manter a atual', async () => {
      await execute(admin, true);

      expect(identityProvider.sessions.get(admin.id)).toEqual(['atual']);
    });

    it('deve gravar o mfa_enabled antes de revogar as sessões', async () => {
      const calls: string[] = [];
      jest.spyOn(userRepository, 'save').mockImplementation(async () => {
        calls.push('save');
      });
      jest.spyOn(identityProvider, 'revokeOtherSessions').mockImplementation(async () => {
        calls.push('revokeOtherSessions');
      });

      await execute(admin, true);

      // Na ordem inversa, um login feito entre os dois passos abriria uma sessão completa.
      expect(calls).toEqual(['save', 'revokeOtherSessions']);
    });

    it('deve lançar EmailNotVerifiedError para o CLIENT com o e-mail não verificado', async () => {
      const { client } = await createClient();
      const save = jest.spyOn(userRepository, 'save');

      await expect(execute(client, true)).rejects.toThrow(EmailNotVerifiedError);

      expect(client.mfaEnabled).toBe(false);
      expect(save).not.toHaveBeenCalled();
      expect(identityProvider.sessions.get(client.id)).toEqual(SESSIONS);
    });

    it('deve responder o CLIENT verificado com os campos do perfil', async () => {
      const { client } = await createClient();
      client.verifyEmail();

      const result = await execute(client, true);

      expect(result).toMatchObject({ id: client.id, mfaEnabled: true, cpf: '52998224725' });
    });

    it('não deve ter efeito quando a verificação já está ativa', async () => {
      admin.enableMfa();
      const { updatedAt } = admin;
      const save = jest.spyOn(userRepository, 'save');

      const result = await execute(admin, true);

      expect(result).toMatchObject({ mfaEnabled: true, updatedAt });
      expect(save).not.toHaveBeenCalled();
      expect(identityProvider.sessions.get(admin.id)).toEqual(SESSIONS);
    });
  });

  describe('ao desativar', () => {
    beforeEach(() => {
      admin.enableMfa();
    });

    it('deve gravar o mfa_enabled sem revogar as sessões (RN24)', async () => {
      const save = jest.spyOn(userRepository, 'save');

      const result = await execute(admin, false);

      expect(save).toHaveBeenCalledWith(admin);
      expect(admin.mfaEnabled).toBe(false);
      expect(result).toMatchObject({ mfaEnabled: false });
      expect(identityProvider.sessions.get(admin.id)).toEqual(SESSIONS);
    });

    it('não deve ter efeito quando a verificação já está desativada', async () => {
      admin.disableMfa();
      const save = jest.spyOn(userRepository, 'save');

      const result = await execute(admin, false);

      expect(result).toMatchObject({ mfaEnabled: false });
      expect(save).not.toHaveBeenCalled();
    });
  });

  it.each([true, false])(
    'deve lançar IncorrectPasswordError e não mudar nada quando a senha não confere (enabled: %p)',
    async (enabled) => {
      if (!enabled) {
        admin.enableMfa();
      }
      const save = jest.spyOn(userRepository, 'save');

      await expect(execute(admin, enabled, 'senha-errada-1')).rejects.toThrow(
        new IncorrectPasswordError('password'),
      );

      expect(admin.mfaEnabled).toBe(!enabled);
      expect(save).not.toHaveBeenCalled();
      expect(identityProvider.sessions.get(admin.id)).toEqual(SESSIONS);
    },
  );

  it('deve conferir a senha também quando o pedido não teria efeito', async () => {
    await expect(execute(admin, false, 'senha-errada-1')).rejects.toThrow(IncorrectPasswordError);
  });

  it('deve lançar UserNotFoundError para um usuário excluído', async () => {
    const { client } = await createClient();
    client.delete();

    await expect(execute(client, true)).rejects.toThrow(UserNotFoundError);
  });
});
