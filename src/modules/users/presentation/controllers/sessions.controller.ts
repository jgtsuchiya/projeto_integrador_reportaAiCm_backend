import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';

import { CurrentUser } from '@modules/auth/presentation/decorators/current-user.decorator';

import type { SessionOutput } from '../../application/dtos/session.output';
import type { AuthenticatedUser } from '../../application/use-cases/get-authenticated-user.use-case';
import { ListSessionsUseCase } from '../../application/use-cases/list-sessions.use-case';
import { RevokeOtherSessionsUseCase } from '../../application/use-cases/revoke-other-sessions.use-case';
import { RevokeSessionUseCase } from '../../application/use-cases/revoke-session.use-case';

/**
 * Sessões abertas do usuário logado, de qualquer papel (RN23). O alvo é sempre o usuário da
 * sessão: ninguém vê nem encerra a sessão de outro usuário por estas rotas.
 */
@Controller('users/me/sessions')
export class SessionsController {
  constructor(
    private readonly listSessionsUseCase: ListSessionsUseCase,
    private readonly revokeSessionUseCase: RevokeSessionUseCase,
    private readonly revokeOtherSessionsUseCase: RevokeOtherSessionsUseCase,
  ) {}

  /** Lista sem paginação, da sessão mais recente para a mais antiga, com a atual marcada. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SessionOutput[]> {
    return this.listSessionsUseCase.execute({
      userId: user.id,
      sessionHandle: user.sessionHandle,
    });
  }

  /** Encerra todas as sessões do usuário, menos a da requisição. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeOthers(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.revokeOtherSessionsUseCase.execute({
      userId: user.id,
      sessionHandle: user.sessionHandle,
    });
  }

  /**
   * Encerra uma sessão do usuário. O id é o da listagem e não tem schema: o formato é do
   * SuperTokens, e um id que não é de uma sessão do usuário responde 404.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.revokeSessionUseCase.execute({ userId: user.id, sessionId: id });
  }
}
