import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { SessionOutput, toSessionOutput } from '../dtos/session.output';
import { IdentityProvider } from '../ports/identity-provider';

export interface ListSessionsInput {
  /** Usuário da sessão. */
  userId: string;
  /** Sessão da requisição, que sai marcada como a atual. */
  sessionHandle: string;
}

/**
 * Sessões abertas do usuário logado, da mais recente para a mais antiga, com a da requisição
 * marcada (RN23). Ninguém lista as sessões de outro usuário: o id vem sempre da sessão.
 */
@Injectable()
export class ListSessionsUseCase implements UseCase<ListSessionsInput, SessionOutput[]> {
  constructor(private readonly identityProvider: IdentityProvider) {}

  async execute(input: ListSessionsInput): Promise<SessionOutput[]> {
    const sessions = await this.identityProvider.listSessions(input.userId);

    return sessions
      .sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.handle.localeCompare(b.handle),
      )
      .map((session) => toSessionOutput(session, input.sessionHandle));
  }
}
