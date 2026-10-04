import type { Page } from '@shared/domain/pagination';

import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { ClientWithProfile, UserRepository } from '../../domain/repositories/user.repository';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role, ROLES } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { IdentityProvider } from '../ports/identity-provider';
import { CreateSuperAdminInput, CreateSuperAdminUseCase } from './create-super-admin.use-case';

class InMemoryUserRepository extends UserRepository {
  readonly items: User[] = [];

  async findById(id: string): Promise<User | null> {
    return this.items.find((user) => user.id === id) ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.items.find((user) => user.email.equals(email)) ?? null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return this.items.some((user) => user.email.equals(email));
  }

  async existsByRole(role: Role): Promise<boolean> {
    return this.items.some((user) => user.role === role);
  }

  async findPage(): Promise<Page<User>> {
    throw new Error('Não usado neste teste.');
  }

  async findClientPage(): Promise<Page<ClientWithProfile>> {
    throw new Error('Não usado neste teste.');
  }

  async save(user: User): Promise<void> {
    this.items.push(user);
  }
  async saveClient(user: User): Promise<void> {
    await this.save(user);
  }

  async updateClient(): Promise<void> {
    throw new Error('Não usado neste teste.');
  }

  async deleteClient(): Promise<void> {
    throw new Error('Não usado neste teste.');
  }

  async saveWithToken(user: User): Promise<void> {
    await this.save(user);
  }
}

class FakeIdentityProvider extends IdentityProvider {
  readonly credentials = new Map<string, string>();
  readonly roles = new Set<Role>();
  readonly userRoles = new Map<string, Role>();
  private nextId = 1;

  async createCredentials(email: Email): Promise<string> {
    if ([...this.credentials.values()].includes(email.value)) {
      throw new EmailAlreadyInUseError();
    }

    const id = `user-${this.nextId++}`;
    this.credentials.set(id, email.value);

    return id;
  }

  async verifyPassword(): Promise<boolean> {
    return true;
  }

  async updatePassword(_userId: string, _password: Password): Promise<void> {}

  async deleteCredentials(userId: string): Promise<void> {
    this.credentials.delete(userId);
    this.userRoles.delete(userId);
  }

  async revokeAllSessions(): Promise<void> {}

  async revokeOtherSessions(): Promise<void> {}

  async createRoles(roles: readonly Role[]): Promise<void> {
    roles.forEach((role) => this.roles.add(role));
  }

  async assignRole(userId: string, role: Role): Promise<void> {
    if (!this.roles.has(role)) {
      throw new Error(`O papel ${role} não existe.`);
    }

    this.userRoles.set(userId, role);
  }
}

describe('CreateSuperAdminUseCase', () => {
  const input: CreateSuperAdminInput = {
    name: '  Super Admin  ',
    email: ' SuperAdmin@ReportaAi.local ',
    password: 'senha-forte-1',
  };
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let sut: CreateSuperAdminUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    identityProvider = new FakeIdentityProvider();
    sut = new CreateSuperAdminUseCase(userRepository, identityProvider);
  });

  it('deve criar os três papéis no provedor de identidade', async () => {
    await sut.execute(input);

    expect([...identityProvider.roles]).toEqual(ROLES);
  });

  it('deve criar a credencial com o papel SUPER_ADMIN e o usuário com o mesmo id', async () => {
    const result = await sut.execute(input);

    expect(result).toEqual({ created: true, userId: 'user-1' });
    expect(identityProvider.credentials.get('user-1')).toBe('superadmin@reportaai.local');
    expect(identityProvider.userRoles.get('user-1')).toBe(Role.SUPER_ADMIN);
    expect(userRepository.items).toHaveLength(1);
    expect(userRepository.items[0]).toMatchObject({
      id: 'user-1',
      role: Role.SUPER_ADMIN,
      name: 'Super Admin',
      status: UserStatus.ACTIVE,
      createdById: null,
    });
    expect(userRepository.items[0].email.value).toBe('superadmin@reportaai.local');
    expect(userRepository.items[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('não deve fazer nada quando já existe um SUPER_ADMIN', async () => {
    await sut.execute(input);

    const result = await sut.execute({ ...input, email: 'outro@reportaai.local' });

    expect(result).toEqual({ created: false });
    expect(identityProvider.credentials.size).toBe(1);
    expect(userRepository.items).toHaveLength(1);
  });

  it('deve recusar um e-mail que já é de outro usuário, sem criar a credencial', async () => {
    await userRepository.save(
      User.createClient({ id: 'client-1', name: 'Maria', email: Email.create(input.email) }),
    );

    await expect(sut.execute(input)).rejects.toThrow(EmailAlreadyInUseError);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it.each([
    ['e-mail', { email: 'invalido' }, InvalidEmailError],
    ['senha', { password: 'curta1' }, InvalidPasswordError],
  ])('deve rejeitar %s inválido antes de acessar o provedor', async (_field, override, error) => {
    await expect(sut.execute({ ...input, ...override })).rejects.toThrow(error);
    expect(identityProvider.roles.size).toBe(0);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it('deve remover a credencial quando a gravação no MySQL falha', async () => {
    const failure = new Error('Falha no MySQL.');
    jest.spyOn(userRepository, 'save').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it('deve remover a credencial quando a atribuição do papel falha', async () => {
    const failure = new Error('Falha no SuperTokens.');
    jest.spyOn(identityProvider, 'assignRole').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    expect(identityProvider.credentials.size).toBe(0);
    expect(userRepository.items).toHaveLength(0);
  });

  it('deve remover a credencial quando o nome é inválido', async () => {
    await expect(sut.execute({ ...input, name: '   ' })).rejects.toThrow('O nome é obrigatório.');
    expect(identityProvider.credentials.size).toBe(0);
  });
});
