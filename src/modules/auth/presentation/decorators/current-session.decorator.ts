import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionContainer } from 'supertokens-node/recipe/session';

import type { AuthenticatedRequest } from '../authenticated-request';

export function getCurrentSession(context: ExecutionContext): SessionContainer {
  const { session } = context.switchToHttp().getRequest<AuthenticatedRequest>();

  // Só acontece numa rota @Public(), onde o AuthGuard não verifica a sessão.
  if (!session) {
    throw new Error('@CurrentSession() usado numa rota sem autenticação.');
  }

  return session;
}

/**
 * Injeta a sessão do SuperTokens da requisição, verificada pelo `AuthGuard`. É para as rotas
 * que alteram a própria sessão, como as da segunda etapa do login. As outras usam o
 * `@CurrentUser()`, que já traz o id da sessão.
 */
export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  getCurrentSession(context),
);
