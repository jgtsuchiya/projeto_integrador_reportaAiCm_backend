import type { Request } from 'express';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';

/** Requisição depois do `AuthGuard`: nas rotas não públicas, `user` está sempre preenchido. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
