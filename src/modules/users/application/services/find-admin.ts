import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Role } from '../../domain/value-objects/role';

/**
 * Busca o ADMIN alvo das rotas de `/api/admins`. Um id de SUPER_ADMIN, de CLIENT, de um
 * usuário excluído ou inexistente é tratado da mesma forma: `UserNotFoundError` (404).
 */
export async function findAdminOrFail(userRepository: UserRepository, id: string): Promise<User> {
  const admin = await userRepository.findById(id);

  if (admin?.role !== Role.ADMIN) {
    throw new UserNotFoundError();
  }

  return admin;
}
