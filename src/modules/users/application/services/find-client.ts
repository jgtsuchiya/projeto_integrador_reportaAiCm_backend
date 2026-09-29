import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { ClientWithProfile, UserRepository } from '../../domain/repositories/user.repository';
import { Role } from '../../domain/value-objects/role';

/**
 * Busca o CLIENT alvo das rotas de `/api/clients`, com o perfil. Um id de ADMIN, de
 * SUPER_ADMIN, de um usuário excluído ou inexistente é tratado da mesma forma:
 * `UserNotFoundError` (404).
 */
export async function findClientOrFail(
  userRepository: UserRepository,
  clientProfileRepository: ClientProfileRepository,
  id: string,
): Promise<ClientWithProfile> {
  const user = await userRepository.findById(id);

  if (user?.role !== Role.CLIENT) {
    throw new UserNotFoundError();
  }

  const profile = await clientProfileRepository.findByUserId(user.id);

  // O CLIENT e o perfil são gravados na mesma transação, e o perfil só sai na exclusão.
  if (!profile) {
    throw new Error(`O CLIENT ${user.id} não tem perfil.`);
  }

  return { user, profile };
}
