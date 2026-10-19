import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { IdentityProvider } from '../ports/identity-provider';

export interface RevokeOtherSessionsInput {
  /** Usuário da sessão. */
  userId: string;
  /** Sessão da requisição, a única mantida. */
  sessionHandle: string;
}

/**
 * Encerra todas as sessões do usuário logado, menos a da requisição (RN23). É o "sair de todos
 * os outros aparelhos".
 */
@Injectable()
export class RevokeOtherSessionsUseCase implements UseCase<RevokeOtherSessionsInput, void> {
  constructor(private readonly identityProvider: IdentityProvider) {}

  async execute(input: RevokeOtherSessionsInput): Promise<void> {
    await this.identityProvider.revokeOtherSessions(input.userId, input.sessionHandle);
  }
}
