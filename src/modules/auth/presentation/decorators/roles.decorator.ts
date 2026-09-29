import { SetMetadata } from '@nestjs/common';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';

export const ROLES_KEY = 'auth:roles';

/**
 * Restringe a rota (ou o controller) aos papéis informados. O papel conferido é o do MySQL,
 * carregado pelo `AuthGuard` a cada requisição, e não o espelhado no token.
 * Um decorator no método substitui o da classe.
 *
 * @example
 * @Roles(Role.SUPER_ADMIN, Role.ADMIN)
 */
export const Roles = (...roles: AuthenticatedUser['role'][]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
