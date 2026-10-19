import { Page, PageRequest } from '@shared/domain/pagination';

import { IdentityProvider } from '../application/ports/identity-provider';
import { ClientProfile } from '../domain/entities/client-profile.entity';
import { LoginAttempt } from '../domain/entities/login-attempt.entity';
import { UserToken } from '../domain/entities/user-token.entity';
import { User } from '../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../domain/errors/email-already-in-use.error';
import { UserNotFoundError } from '../domain/errors/user-not-found.error';
import { ClientProfileRepository } from '../domain/repositories/client-profile.repository';
import { LoginAttemptRepository } from '../domain/repositories/login-attempt.repository';
import {
  ClientFilter,
  ClientWithProfile,
  UserFilter,
  UserRepository,
} from '../domain/repositories/user.repository';
import { UserTokenRepository } from '../domain/repositories/user-token.repository';
import { Cpf } from '../domain/value-objects/cpf';
import { Email } from '../domain/value-objects/email';
import { Password } from '../domain/value-objects/password';
import { Role } from '../domain/value-objects/role';
import { UserTokenType } from '../domain/value-objects/user-token-type';

/**
 * Fakes do módulo users para os testes de caso de uso. Os repositórios compartilham um
 * `InMemoryUsersDatabase`, como as tabelas do MySQL, e o `FakeIdentityProvider` faz o papel
 * do SuperTokens.
 *
 * As entidades são guardadas por referência: uma alteração feita pelo caso de uso aparece no
 * "banco" mesmo sem ser gravada. Para testar uma falha de gravação, use o teste de integração.
 */
export class InMemoryUsersDatabase {
  readonly users = new Map<string, User>();
  readonly profiles = new Map<string, ClientProfile>();
  readonly tokens = new Map<string, UserToken>();
  readonly loginAttempts = new Map<string, LoginAttempt>();
}

export class InMemoryUserRepository extends UserRepository {
  constructor(private readonly database: InMemoryUsersDatabase) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    const user = this.database.users.get(id);

    return user && !user.isDeleted ? user : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.activeUsers().find((user) => user.email.equals(email)) ?? null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }

  async existsByRole(role: Role): Promise<boolean> {
    return this.activeUsers().some((user) => user.role === role);
  }

  async findPage(filter: UserFilter, { page, pageSize }: PageRequest): Promise<Page<User>> {
    const users = this.activeUsers()
      .filter((user) => user.role === filter.role)
      .filter((user) => !filter.status || user.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const start = (page - 1) * pageSize;

    return { items: users.slice(start, start + pageSize), page, pageSize, total: users.length };
  }

  async findClientPage(
    filter: ClientFilter,
    { page, pageSize }: PageRequest,
  ): Promise<Page<ClientWithProfile>> {
    const text = filter.text?.toLowerCase();
    const clients = this.activeUsers()
      .filter((user) => user.role === Role.CLIENT)
      .filter((user) => !filter.status || user.status === filter.status)
      .filter(
        (user) =>
          !text || user.name.toLowerCase().includes(text) || user.email.value.includes(text),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
      .flatMap((user) => {
        const profile = this.database.profiles.get(user.id);

        return profile && (!filter.cpf || profile.cpf.equals(filter.cpf))
          ? [{ user, profile }]
          : [];
      });
    const start = (page - 1) * pageSize;

    return { items: clients.slice(start, start + pageSize), page, pageSize, total: clients.length };
  }

  async save(user: User): Promise<void> {
    this.database.users.set(user.id, user);
  }

  async saveClient(user: User, profile: ClientProfile, token: UserToken): Promise<void> {
    await this.updateClient(user, profile);
    this.database.tokens.set(token.id, token);
  }

  async updateClient(user: User, profile: ClientProfile): Promise<void> {
    this.database.users.set(user.id, user);
    this.database.profiles.set(profile.userId, profile);
  }

  async deleteClient(user: User): Promise<void> {
    this.database.users.set(user.id, user);
    this.database.profiles.delete(user.id);
  }

  async saveWithToken(user: User, token: UserToken): Promise<void> {
    this.database.users.set(user.id, user);
    this.database.tokens.set(token.id, token);
  }

  private activeUsers(): User[] {
    return [...this.database.users.values()].filter((user) => !user.isDeleted);
  }
}

export class InMemoryClientProfileRepository extends ClientProfileRepository {
  constructor(private readonly database: InMemoryUsersDatabase) {
    super();
  }

  async findByUserId(userId: string): Promise<ClientProfile | null> {
    return this.database.profiles.get(userId) ?? null;
  }

  async existsByCpf(cpf: Cpf): Promise<boolean> {
    return [...this.database.profiles.values()].some((profile) => profile.cpf.equals(cpf));
  }

  async save(profile: ClientProfile): Promise<void> {
    this.database.profiles.set(profile.userId, profile);
  }

  async delete(userId: string): Promise<void> {
    this.database.profiles.delete(userId);
  }
}

export class InMemoryUserTokenRepository extends UserTokenRepository {
  constructor(private readonly database: InMemoryUsersDatabase) {
    super();
  }

  async findByHash(tokenHash: string): Promise<UserToken | null> {
    return (
      [...this.database.tokens.values()].find((token) => token.tokenHash === tokenHash) ?? null
    );
  }

  async findLatest(userId: string, type: UserTokenType): Promise<UserToken | null> {
    const [latest] = [...this.database.tokens.values()]
      .filter((token) => token.userId === userId && token.type === type)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return latest ?? null;
  }

  async replace(token: UserToken): Promise<void> {
    for (const [id, existing] of this.database.tokens) {
      if (existing.userId === token.userId && existing.type === token.type) {
        this.database.tokens.delete(id);
      }
    }

    this.database.tokens.set(token.id, token);
  }

  async saveAttempts(token: UserToken): Promise<void> {
    // Como o UPDATE do banco: um token já removido (ex.: por um reenvio) não volta.
    if (this.database.tokens.has(token.id)) {
      this.database.tokens.set(token.id, token);
    }
  }

  async deleteByUserId(userId: string): Promise<void> {
    for (const [id, token] of this.database.tokens) {
      if (token.userId === userId) {
        this.database.tokens.delete(id);
      }
    }
  }
}

export class InMemoryLoginAttemptRepository extends LoginAttemptRepository {
  constructor(private readonly database: InMemoryUsersDatabase) {
    super();
  }

  async save(attempt: LoginAttempt): Promise<void> {
    this.database.loginAttempts.set(attempt.id, attempt);
  }

  async countRecentFailures(email: Email, since: Date): Promise<number> {
    const recent = this.attemptsOf(email).filter((attempt) => attempt.createdAt > since);
    const lastSuccess = Math.max(
      since.getTime(),
      ...recent
        .filter((attempt) => attempt.succeeded)
        .map((attempt) => attempt.createdAt.getTime()),
    );

    return recent.filter(
      (attempt) => !attempt.succeeded && attempt.createdAt.getTime() > lastSuccess,
    ).length;
  }

  async deleteFailuresSince(email: Email, since: Date): Promise<void> {
    this.deleteWhere(
      (attempt) => attempt.email.equals(email) && !attempt.succeeded && attempt.createdAt > since,
    );
  }

  async deleteByEmail(email: Email): Promise<void> {
    this.deleteWhere((attempt) => attempt.email.equals(email));
  }

  async deleteOlderThan(date: Date): Promise<void> {
    this.deleteWhere((attempt) => attempt.createdAt < date);
  }

  private attemptsOf(email: Email): LoginAttempt[] {
    return [...this.database.loginAttempts.values()].filter((attempt) =>
      attempt.email.equals(email),
    );
  }

  private deleteWhere(matches: (attempt: LoginAttempt) => boolean): void {
    for (const [id, attempt] of this.database.loginAttempts) {
      if (matches(attempt)) {
        this.database.loginAttempts.delete(id);
      }
    }
  }
}

/**
 * SuperTokens em memória: guarda a senha em texto puro só para os testes conferirem. As
 * sessões são só os handles de cada usuário, que os testes criam direto em `sessions`.
 */
export class FakeIdentityProvider extends IdentityProvider {
  readonly credentials = new Map<string, { email: string; password: string }>();
  readonly userRoles = new Map<string, Role>();
  readonly sessions = new Map<string, string[]>();
  private nextId = 1;

  async createCredentials(email: Email, password: Password): Promise<string> {
    if ([...this.credentials.values()].some((credential) => credential.email === email.value)) {
      throw new EmailAlreadyInUseError();
    }

    const id = `user-${this.nextId++}`;
    this.credentials.set(id, { email: email.value, password: password.value });

    return id;
  }

  async verifyPassword(email: Email, password: string): Promise<boolean> {
    return [...this.credentials.values()].some(
      (credential) => credential.email === email.value && credential.password === password,
    );
  }

  async updatePassword(userId: string, password: Password): Promise<void> {
    const credential = this.credentials.get(userId);

    if (!credential) {
      throw new UserNotFoundError();
    }

    credential.password = password.value;
  }

  async deleteCredentials(userId: string): Promise<void> {
    this.credentials.delete(userId);
    this.userRoles.delete(userId);
    this.sessions.delete(userId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }

  async revokeOtherSessions(userId: string, currentSessionHandle: string): Promise<void> {
    const handles = this.sessions.get(userId) ?? [];
    this.sessions.set(
      userId,
      handles.filter((handle) => handle === currentSessionHandle),
    );
  }

  async createRoles(): Promise<void> {}

  async assignRole(userId: string, role: Role): Promise<void> {
    this.userRoles.set(userId, role);
  }
}
