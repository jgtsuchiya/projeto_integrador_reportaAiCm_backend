import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';

import type { AuthenticatedRequest } from '../authenticated-request';

export function getCurrentUser(context: ExecutionContext): AuthenticatedUser {
  const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

  // Só acontece numa rota @Public(), onde o AuthGuard não carrega o usuário.
  if (!user) {
    throw new Error('@CurrentUser() usado numa rota sem autenticação.');
  }

  return user;
}

/** Injeta o usuário autenticado (id e papel), carregado pelo `AuthGuard`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  getCurrentUser(context),
);
