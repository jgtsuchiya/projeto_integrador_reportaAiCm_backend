import { Injectable } from '@nestjs/common';
import type { SessionContainer } from 'supertokens-node/recipe/session';

import { SessionSecondFactor } from '../../application/ports/session-second-factor';
import { SecondFactorClaim, secondFactorCompletedValidator } from './second-factor.claim';

/** Implementação do `SessionSecondFactor` com a claim de sessão `mfa-verified` do SuperTokens. */
@Injectable()
export class SuperTokensSessionSecondFactor implements SessionSecondFactor<SessionContainer> {
  async isPending(session: SessionContainer): Promise<boolean> {
    // A sessão aberta antes de a claim existir não a tem, e não está pendente.
    return (await session.getClaimValue(SecondFactorClaim)) === false;
  }

  async assertCompleted(session: SessionContainer): Promise<void> {
    await session.assertClaims([secondFactorCompletedValidator]);
  }

  async complete(session: SessionContainer): Promise<void> {
    await session.setClaimValue(SecondFactorClaim, true);
  }
}
