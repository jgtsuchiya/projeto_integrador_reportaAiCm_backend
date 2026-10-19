import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import Session, { type SessionContainer } from 'supertokens-node/recipe/session';

import {
  AuthenticatedUser,
  GetAuthenticatedUserUseCase,
} from '@modules/users/application/use-cases/get-authenticated-user.use-case';

import { SessionSecondFactor } from '../../application/ports/session-second-factor';
import type { AuthenticatedRequest } from '../authenticated-request';
import { ALLOW_PENDING_SECOND_FACTOR_KEY } from '../decorators/allow-pending-second-factor.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

export const INVALID_SESSION_MESSAGE = 'Sessão inválida. Faça login novamente.';
export const FORBIDDEN_ROLE_MESSAGE = 'Você não tem permissão para acessar este recurso.';

/**
 * Guard global: toda rota exige sessão, exceto as marcadas com `@Public()`.
 *
 * 1. Verifica a sessão do SuperTokens (cookie ou header). Sem sessão, ou com o access token
 *    expirado, o erro do SDK é respondido pelo `SuperTokensExceptionFilter` (401), e os SDKs
 *    de front tentam o refresh sozinhos.
 * 2. Carrega o usuário no MySQL e bloqueia quem não estiver ACTIVE ou tiver sido excluído,
 *    na hora, mesmo com o token ainda válido (RN10).
 * 3. Recusa a sessão pendente, de quem ainda não conferiu o código da segunda etapa (RN25),
 *    exceto nas rotas marcadas com `@AllowPendingSecondFactor()`. O erro do SDK é respondido
 *    pelo `SuperTokensExceptionFilter` (403 `invalid claim`).
 * 4. Confere o papel do MySQL contra o `@Roles(...)` da rota (403).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly getAuthenticatedUser: GetAuthenticatedUserUseCase,
    private readonly sessionSecondFactor: SessionSecondFactor<SessionContainer>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const session = await Session.getSession(request, http.getResponse<Response>());
    const user = await this.getAuthenticatedUser.execute({
      userId: session.getUserId(),
      sessionHandle: session.getHandle(),
    });

    if (!user) {
      // Encerra a sessão (e limpa os tokens do front), para o SDK não ficar renovando o
      // token de um usuário que perdeu o acesso.
      await session.revokeSession();
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    request.user = user;
    request.session = session;

    const allowsPendingSecondFactor = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PENDING_SECOND_FACTOR_KEY,
      targets,
    );

    if (!allowsPendingSecondFactor) {
      await this.sessionSecondFactor.assertCompleted(session);
    }

    const roles = this.reflector.getAllAndOverride<AuthenticatedUser['role'][] | undefined>(
      ROLES_KEY,
      targets,
    );

    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException(FORBIDDEN_ROLE_MESSAGE);
    }

    return true;
  }
}
