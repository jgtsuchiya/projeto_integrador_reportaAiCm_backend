import { ClientProfile } from '../entities/client-profile.entity';
import { User } from '../entities/user.entity';
import { Email } from '../value-objects/email';
import { Role } from '../value-objects/role';

/** As buscas ignoram os usuários excluídos (`deleted_at` preenchido). */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: Email): Promise<User | null>;
  abstract existsByEmail(email: Email): Promise<boolean>;
  abstract existsByRole(role: Role): Promise<boolean>;
  /** Insere ou atualiza, inclusive a exclusão lógica feita por `User.delete()`. */
  abstract save(user: User): Promise<void>;
  /**
   * Insere o CLIENT e o perfil dele na mesma transação: se um falhar, nenhum é gravado.
   * Lança `EmailAlreadyInUseError` ou `CpfAlreadyInUseError` quando um cadastro concorrente
   * grava o mesmo e-mail ou CPF antes (RN02, RN07).
   */
  abstract saveClient(user: User, profile: ClientProfile): Promise<void>;
}
