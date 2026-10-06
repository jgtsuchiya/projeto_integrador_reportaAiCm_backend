import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import type { Page } from '@shared/domain/pagination';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { CpfAlreadyInUseError } from '../../domain/errors/cpf-already-in-use.error';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { InvalidBirthDateError } from '../../domain/errors/invalid-birth-date.error';
import { InvalidCpfError } from '../../domain/errors/invalid-cpf.error';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { InvalidPhoneError } from '../../domain/errors/invalid-phone.error';
import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { ClientWithProfile, UserRepository } from '../../domain/repositories/user.repository';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { IdentityProvider } from '../ports/identity-provider';
import {
  EMAIL_VERIFICATION_MAIL_SUBJECT,
  EmailVerificationService,
} from '../services/email-verification.service';
import { UserMailService } from '../services/user-mail.service';
import { RegisterClientInput, RegisterClientUseCase } from './register-client.use-case';

const HOUR_IN_MS = 60 * 60 * 1000;

/** Guarda usuários, perfis e tokens juntos, como as tabelas do MySQL. */
class InMemoryUsersDatabase {
  readonly users: User[] = [];
  readonly profiles: ClientProfile[] = [];
  readonly tokens: UserToken[] = [];
}

class InMemoryUserRepository extends UserRepository {
  constructor(private readonly database: InMemoryUsersDatabase) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    return this.database.users.find((user) => user.id === id) ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.database.users.find((user) => user.email.equals(email)) ?? null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }

  async existsByRole(role: Role): Promise<boolean> {
    return this.database.users.some((user) => user.role === role);
  }

  async findPage(): Promise<Page<User>> {
    throw new Error('Não usado neste teste.');
  }

  async findClientPage(): Promise<Page<ClientWithProfile>> {
    throw new Error('Não usado neste teste.');
  }

  async save(user: User): Promise<void> {
    this.database.users.push(user);
  }

  async saveClient(user: User, profile: ClientProfile, token: UserToken): Promise<void> {
    this.database.users.push(user);
    this.database.profiles.push(profile);
    this.database.tokens.push(token);
  }

  async updateClient(): Promise<void> {
    throw new Error('Não usado neste teste.');
  }

  async deleteClient(): Promise<void> {
    throw new Error('Não usado neste teste.');
  }

  async saveWithToken(user: User): Promise<void> {
    this.database.users.push(user);
  }
}

class InMemoryClientProfileRepository extends ClientProfileRepository {
  constructor(private readonly database: InMemoryUsersDatabase) {
    super();
  }

  async findByUserId(userId: string): Promise<ClientProfile | null> {
    return this.database.profiles.find((profile) => profile.userId === userId) ?? null;
  }

  async existsByCpf(cpf: Cpf): Promise<boolean> {
    return this.database.profiles.some((profile) => profile.cpf.equals(cpf));
  }

  async save(profile: ClientProfile): Promise<void> {
    this.database.profiles.push(profile);
  }

  async delete(userId: string): Promise<void> {
    const index = this.database.profiles.findIndex((profile) => profile.userId === userId);
    this.database.profiles.splice(index, 1);
  }
}

class FakeIdentityProvider extends IdentityProvider {
  readonly credentials = new Map<string, { email: string; password: string }>();
  readonly userRoles = new Map<string, Role>();
  private nextId = 1;

  async createCredentials(email: Email, password: Password): Promise<string> {
    if ([...this.credentials.values()].some((credential) => credential.email === email.value)) {
      throw new EmailAlreadyInUseError();
    }

    const id = `user-${this.nextId++}`;
    this.credentials.set(id, { email: email.value, password: password.value });

    return id;
  }

  async verifyPassword(): Promise<boolean> {
    return true;
  }

  async updatePassword(): Promise<void> {}

  async deleteCredentials(userId: string): Promise<void> {
    this.credentials.delete(userId);
    this.userRoles.delete(userId);
  }

  async revokeAllSessions(): Promise<void> {}

  async revokeOtherSessions(): Promise<void> {}

  async createRoles(): Promise<void> {}

  async assignRole(userId: string, role: Role): Promise<void> {
    this.userRoles.set(userId, role);
  }
}

describe('RegisterClientUseCase', () => {
  const input: RegisterClientInput = {
    name: '  Maria da Silva  ',
    email: ' Maria@Example.com ',
    password: 'senha-forte-1',
    cpf: '529.982.247-25',
    phone: '(43) 99999-8888',
    birthDate: '1990-05-20',
  };
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let mailSender: FakeMailSender;
  let sut: RegisterClientUseCase;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    mailSender = new FakeMailSender();
    sut = new RegisterClientUseCase(
      userRepository,
      new InMemoryClientProfileRepository(database),
      identityProvider,
      new EmailVerificationService(
        new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
        { expiresInHours: 24 },
      ),
    );
  });

  /** Segredo do link de verificação do último e-mail enviado. */
  function lastSecret(): string {
    const match = /\/verificar-email\?token=([\w-]+)/.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum link de verificação foi enviado.');
    }

    return match[1];
  }

  function seedClient(overrides: { email?: string; cpf?: string } = {}): void {
    const user = User.createClient({
      id: 'client-existente',
      name: 'João',
      email: Email.create(overrides.email ?? 'joao@example.com'),
    });
    database.users.push(user);
    database.profiles.push(
      ClientProfile.create({
        userId: user.id,
        cpf: Cpf.create(overrides.cpf ?? '111.444.777-35'),
        phone: Phone.create('43988887777'),
        birthDate: BirthDate.create('1985-01-10'),
      }),
    );
  }

  it('deve criar a credencial com o papel CLIENT e o usuário ACTIVE com o mesmo id (RN05)', async () => {
    await sut.execute(input);

    expect(identityProvider.credentials.get('user-1')).toEqual({
      email: 'maria@example.com',
      password: 'senha-forte-1',
    });
    expect(identityProvider.userRoles.get('user-1')).toBe(Role.CLIENT);
    expect(database.users).toHaveLength(1);
    expect(database.users[0]).toMatchObject({
      id: 'user-1',
      role: Role.CLIENT,
      name: 'Maria da Silva',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      createdById: null,
    });
    expect(database.users[0].email.value).toBe('maria@example.com');
  });

  it('deve gravar o perfil com CPF e telefone só com dígitos (RN07)', async () => {
    await sut.execute(input);

    expect(database.profiles).toHaveLength(1);
    expect(database.profiles[0].userId).toBe('user-1');
    expect(database.profiles[0].cpf.value).toBe('52998224725');
    expect(database.profiles[0].phone.value).toBe('43999998888');
    expect(database.profiles[0].birthDate.value).toBe('1990-05-20');
  });

  it('deve retornar o perfil criado, sem a senha', async () => {
    const result = await sut.execute(input);

    expect(result).toEqual({
      id: 'user-1',
      role: Role.CLIENT,
      name: 'Maria da Silva',
      email: 'maria@example.com',
      status: UserStatus.ACTIVE,
      cpf: '52998224725',
      phone: '43999998888',
      birthDate: '1990-05-20',
      createdAt: expect.any(Date) as Date,
    });
    expect(JSON.stringify(result)).not.toContain(input.password);
  });

  it('deve gravar o token de verificação e enviar o link para o e-mail do cadastro (RN22)', async () => {
    await sut.execute(input);

    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0]).toMatchObject({
      to: 'maria@example.com',
      subject: EMAIL_VERIFICATION_MAIL_SUBJECT,
    });
    expect(database.tokens).toHaveLength(1);
    const [token] = database.tokens;
    expect(token.userId).toBe('user-1');
    expect(token.type).toBe(UserTokenType.EMAIL_VERIFICATION);
    expect(token.tokenHash).toBe(UserToken.hash(lastSecret()));
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(24 * HOUR_IN_MS);
    expect(token.isUsable()).toBe(true);
  });

  it('deve concluir o cadastro quando o envio do e-mail de verificação falha', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    const result = await sut.execute(input);

    expect(result).toMatchObject({ id: 'user-1', email: 'maria@example.com' });
    expect(identityProvider.credentials.size).toBe(1);
    expect(database.users).toHaveLength(1);
    expect(database.tokens).toHaveLength(1);
  });

  it('não deve remover a credencial quando o envio do e-mail lança outro erro', async () => {
    const failure = new Error('Bug no template.');
    jest.spyOn(mailSender, 'send').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    // A conta já está gravada no MySQL: sem a credencial, ela ficaria sem login.
    expect(identityProvider.credentials.size).toBe(1);
    expect(database.users).toHaveLength(1);
  });

  it('deve recusar um e-mail já cadastrado, sem criar a credencial (RN02)', async () => {
    seedClient({ email: 'MARIA@example.com' });

    await expect(sut.execute(input)).rejects.toThrow(EmailAlreadyInUseError);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it('deve recusar um CPF já cadastrado, sem criar a credencial (RN07)', async () => {
    seedClient({ cpf: '52998224725' });

    await expect(sut.execute(input)).rejects.toThrow(CpfAlreadyInUseError);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it('deve repassar o conflito quando o e-mail já tem credencial no provedor', async () => {
    await identityProvider.createCredentials(
      Email.create(input.email),
      Password.create(input.password),
    );

    await expect(sut.execute(input)).rejects.toThrow(EmailAlreadyInUseError);
    expect(database.users).toHaveLength(0);
  });

  it.each([
    ['e-mail', { email: 'invalido' }, InvalidEmailError],
    ['senha', { password: 'somenteletras' }, InvalidPasswordError],
    ['CPF', { cpf: '529.982.247-26' }, InvalidCpfError],
    ['telefone', { phone: '0099999888' }, InvalidPhoneError],
    ['data de nascimento', { birthDate: '2999-01-01' }, InvalidBirthDateError],
  ])('deve rejeitar %s inválido antes de acessar o provedor', async (_field, override, error) => {
    await expect(sut.execute({ ...input, ...override })).rejects.toThrow(error);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it('deve remover a credencial quando a gravação no MySQL falha', async () => {
    const failure = new Error('Falha no MySQL.');
    jest.spyOn(userRepository, 'saveClient').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    expect(identityProvider.credentials.size).toBe(0);
    expect(identityProvider.userRoles.size).toBe(0);
    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve remover a credencial quando a atribuição do papel falha', async () => {
    const failure = new Error('Falha no SuperTokens.');
    jest.spyOn(identityProvider, 'assignRole').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    expect(identityProvider.credentials.size).toBe(0);
    expect(database.users).toHaveLength(0);
  });

  it('deve remover a credencial quando o nome é inválido', async () => {
    await expect(sut.execute({ ...input, name: '   ' })).rejects.toThrow('O nome é obrigatório.');
    expect(identityProvider.credentials.size).toBe(0);
  });
});
