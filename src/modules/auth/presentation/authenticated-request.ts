import type { Request } from 'express';
import type { SessionContainer } from 'supertokens-node/recipe/session';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';

/**
 * Requisição depois do `AuthGuard`: nas rotas não públicas, `user` e `session` estão sempre
 * preenchidos.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /** Sessão do SuperTokens, para as rotas que a alteram (`@CurrentSession()`). */
  session?: SessionContainer;
}
