import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { SessionNotFoundError } from '../../domain/errors/session-not-found.error';
import { IdentityProvider } from '../ports/identity-provider';

export interface RevokeSessionInput {
  /** Usuário da sessão. */
  userId: string;
  /** Id da sessão a encerrar, como veio na listagem. */
  sessionId: string;
}

/**
 * Encerra uma sessão do usuário logado, que pode ser a da própria requisição (RN23). O id de
 * uma sessão de outro usuário, ou que não existe, gera `SessionNotFoundError` (404).
 *
 * A sessão encerrada não renova mais o token. O access token já emitido continua aceito até
 * expirar, como no signout.
 */
@Injectable()
export class RevokeSessionUseCase implements UseCase<RevokeSessionInput, void> {
  constructor(private readonly identityProvider: IdentityProvider) {}

  async execute(input: RevokeSessionInput): Promise<void> {
    // O provedor encerra a sessão de qualquer usuário, então a posse é conferida antes.
    const sessions = await this.identityProvider.listSessions(input.userId);

    if (!sessions.some((session) => session.handle === input.sessionId)) {
      throw new SessionNotFoundError();
    }

    await this.identityProvider.revokeSession(input.sessionId);
  }
}
