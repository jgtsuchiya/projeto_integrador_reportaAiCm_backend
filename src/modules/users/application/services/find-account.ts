import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Role } from '../../domain/value-objects/role';

/** Conta do usuário logado. O perfil só existe no CLIENT. */
export interface Account {
  user: User;
  profile: ClientProfile | null;
}

/**
 * Busca a conta do usuário logado, alvo das rotas de `/api/users/me`, com o perfil quando ele
 * é CLIENT. O `AuthGuard` já confirmou que o usuário existe, mas ele pode ter sido excluído
 * entre o guard e o caso de uso: nesse caso, `UserNotFoundError` (404).
 */
export async function findAccountOrFail(
  userRepository: UserRepository,
  clientProfileRepository: ClientProfileRepository,
  userId: string,
): Promise<Account> {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new UserNotFoundError();
  }

  if (user.role !== Role.CLIENT) {
    return { user, profile: null };
  }

  const profile = await clientProfileRepository.findByUserId(user.id);

  // O CLIENT e o perfil são gravados na mesma transação, e o perfil só sai na exclusão.
  if (!profile) {
    throw new Error(`O CLIENT ${user.id} não tem perfil.`);
  }

  return { user, profile };
}
