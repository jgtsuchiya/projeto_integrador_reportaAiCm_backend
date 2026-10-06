import { Page, PageRequest } from '@shared/domain/pagination';

import { ClientProfile } from '../entities/client-profile.entity';
import { UserToken } from '../entities/user-token.entity';
import { User } from '../entities/user.entity';
import { Cpf } from '../value-objects/cpf';
import { Email } from '../value-objects/email';
import { Role } from '../value-objects/role';
import { UserStatus } from '../value-objects/user-status';

/** Filtros das listagens de usuários. */
export interface UserFilter {
  role: Role;
  status?: UserStatus;
}

/** Filtros da listagem de CLIENTs. `text` e `cpf` são alternativos: a busca usa um ou outro. */
export interface ClientFilter {
  status?: UserStatus;
  /** Trecho do nome ou do e-mail. */
  text?: string;
  /** CPF exato. */
  cpf?: Cpf;
}

/** CLIENT com o perfil dele, como aparece na listagem do painel. */
export interface ClientWithProfile {
  user: User;
  profile: ClientProfile;
}

/** As buscas ignoram os usuários excluídos (`deleted_at` preenchido). */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: Email): Promise<User | null>;
  abstract existsByEmail(email: Email): Promise<boolean>;
  abstract existsByRole(role: Role): Promise<boolean>;
  /** Lista paginada, dos mais recentes para os mais antigos. */
  abstract findPage(filter: UserFilter, page: PageRequest): Promise<Page<User>>;
  /** Lista paginada dos CLIENTs com o perfil, dos mais recentes para os mais antigos. */
  abstract findClientPage(
    filter: ClientFilter,
    page: PageRequest,
  ): Promise<Page<ClientWithProfile>>;
  /** Insere ou atualiza, inclusive a exclusão lógica feita por `User.delete()`. */
  abstract save(user: User): Promise<void>;
  /**
   * Insere o CLIENT, o perfil dele e o token de verificação de e-mail (RN22) na mesma
   * transação: se um falhar, nenhum é gravado. Lança `EmailAlreadyInUseError` ou
   * `CpfAlreadyInUseError` quando um cadastro concorrente grava o mesmo e-mail ou CPF antes
   * (RN02, RN07).
   */
  abstract saveClient(user: User, profile: ClientProfile, token: UserToken): Promise<void>;
  /** Atualiza um CLIENT existente e o perfil dele na mesma transação (edição do perfil). */
  abstract updateClient(user: User, profile: ClientProfile): Promise<void>;
  /**
   * Grava a exclusão lógica feita por `User.delete()` e remove o perfil do CLIENT na mesma
   * transação (RN11, LGPD). Assim, o CPF só fica livre junto com a anonimização.
   */
  abstract deleteClient(user: User): Promise<void>;
  /**
   * Grava o usuário e o token na mesma transação: se um falhar, nenhum é gravado. Usado no
   * convite do ADMIN (insere os dois) e quando um link é usado, como no aceite do convite
   * (atualiza os dois). Lança `EmailAlreadyInUseError` quando um cadastro concorrente grava o
   * mesmo e-mail antes (RN02).
   */
  abstract saveWithToken(user: User, token: UserToken): Promise<void>;
}
