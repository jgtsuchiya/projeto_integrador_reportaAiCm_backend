import { Entity } from '@shared/domain/entity';

import { InvalidStatusTransitionError } from '../errors/invalid-status-transition.error';
import { InvalidUserNameError } from '../errors/invalid-user-name.error';
import { SuperAdminProtectedError } from '../errors/super-admin-protected.error';
import { UserAlreadyDeletedError } from '../errors/user-already-deleted.error';
import { Email } from '../value-objects/email';
import { Role } from '../value-objects/role';
import { UserStatus } from '../value-objects/user-status';

export const USER_NAME_MAX_LENGTH = 120;

/** Domínio do e-mail que substitui o original na exclusão (RN11). O TLD `.invalid` é reservado. */
export const DELETED_EMAIL_DOMAIN = 'reportaai.invalid';

/** Nome que substitui o do CLIENT excluído (RN11). */
export const DELETED_USER_NAME = 'Usuário excluído';

export interface UserProps {
  role: Role;
  name: string;
  email: Email;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface CreateUserInput {
  /** Id gerado pelo SuperTokens ao criar a credencial. */
  id: string;
  name: string;
  email: Email;
}

interface CreateAdminInput extends CreateUserInput {
  /** SuperAdm que fez o convite. */
  createdById: string;
}

/**
 * Usuário de qualquer papel. As credenciais ficam no SuperTokens: aqui ficam o papel,
 * o status de acesso e os dados comuns.
 *
 * Transições de status:
 * - PENDING → ACTIVE, só pelo aceite do convite (`acceptInvitation`);
 * - ACTIVE → INACTIVE (`deactivate`) e INACTIVE → ACTIVE (`activate`).
 */
export class User extends Entity {
  private constructor(
    id: string,
    private readonly props: UserProps,
  ) {
    super(id);
  }

  /** CLIENT do autocadastro: já nasce ACTIVE (RN05). */
  static createClient(input: CreateUserInput): User {
    return User.create(input, Role.CLIENT, UserStatus.ACTIVE, null);
  }

  /** ADMIN convidado: nasce PENDING até aceitar o convite (RN06). */
  static createAdmin(input: CreateAdminInput): User {
    return User.create(input, Role.ADMIN, UserStatus.PENDING, input.createdById);
  }

  /** SUPER_ADMIN do seed (RN03): já nasce ACTIVE e com o e-mail verificado. */
  static createSuperAdmin(input: CreateUserInput): User {
    const user = User.create(input, Role.SUPER_ADMIN, UserStatus.ACTIVE, null);
    user.props.emailVerifiedAt = user.props.createdAt;

    return user;
  }

  /** Reconstrói um usuário já persistido, sem validar nem alterar os dados. */
  static restore(id: string, props: UserProps): User {
    return new User(id, { ...props });
  }

  private static create(
    input: CreateUserInput,
    role: Role,
    status: UserStatus,
    createdById: string | null,
  ): User {
    const now = new Date();

    return new User(input.id, {
      role,
      name: User.validateName(input.name),
      email: input.email,
      status,
      emailVerifiedAt: null,
      mfaEnabled: false,
      lastLoginAt: null,
      createdById,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  private static validateName(raw: string): string {
    const name = raw.trim();

    if (name.length === 0) {
      throw new InvalidUserNameError('O nome é obrigatório.');
    }

    if (name.length > USER_NAME_MAX_LENGTH) {
      throw new InvalidUserNameError(
        `O nome deve ter no máximo ${USER_NAME_MAX_LENGTH} caracteres.`,
      );
    }

    return name;
  }

  /** O papel não muda depois da criação (RN01), por isso não há setter. */
  get role(): Role {
    return this.props.role;
  }

  get name(): string {
    return this.props.name;
  }

  get email(): Email {
    return this.props.email;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt;
  }

  get mfaEnabled(): boolean {
    return this.props.mfaEnabled;
  }

  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt;
  }

  get createdById(): string | null {
    return this.props.createdById;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  /** Só usuários ACTIVE e não excluídos fazem login e acessam a API (RN09, RN10). */
  canAccess(): boolean {
    return this.props.status === UserStatus.ACTIVE && !this.isDeleted;
  }

  rename(name: string): void {
    this.ensureNotDeleted();
    this.props.name = User.validateName(name);
    this.touch();
  }

  /** O ADMIN aceitou o convite e definiu a senha: fica ACTIVE e com o e-mail verificado (RN06). */
  acceptInvitation(): void {
    this.changeStatus(UserStatus.PENDING, UserStatus.ACTIVE);
    this.props.emailVerifiedAt = this.props.updatedAt;
  }

  /** Reativa um usuário inativado. */
  activate(): void {
    this.changeStatus(UserStatus.INACTIVE, UserStatus.ACTIVE);
  }

  /** Bloqueia o acesso. Quem chama também revoga as sessões no SuperTokens (RN10). */
  deactivate(): void {
    this.ensureNotSuperAdmin();
    this.changeStatus(UserStatus.ACTIVE, UserStatus.INACTIVE);
  }

  recordLogin(): void {
    this.props.lastLoginAt = new Date();
  }

  /**
   * Exclusão lógica com anonimização (RN11). O e-mail vira `deleted+<id>@reportaai.invalid`,
   * o que libera o endereço para um novo cadastro. O nome do CLIENT é anonimizado, e o do
   * ADMIN é mantido para auditoria.
   *
   * Quem chama também remove o usuário do SuperTokens e, no CLIENT, o `ClientProfile`.
   */
  delete(): void {
    this.ensureNotSuperAdmin();
    this.ensureNotDeleted();

    this.props.email = Email.create(`deleted+${this.id}@${DELETED_EMAIL_DOMAIN}`);
    if (this.props.role === Role.CLIENT) {
      this.props.name = DELETED_USER_NAME;
    }
    this.touch();
    this.props.deletedAt = this.props.updatedAt;
  }

  private changeStatus(from: UserStatus, to: UserStatus): void {
    this.ensureNotDeleted();

    if (this.props.status !== from) {
      throw new InvalidStatusTransitionError(this.props.status, to);
    }

    this.props.status = to;
    this.touch();
  }

  private ensureNotSuperAdmin(): void {
    if (this.props.role === Role.SUPER_ADMIN) {
      throw new SuperAdminProtectedError();
    }
  }

  private ensureNotDeleted(): void {
    if (this.isDeleted) {
      throw new UserAlreadyDeletedError();
    }
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
