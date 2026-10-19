import type { SessionContainer } from 'supertokens-node/recipe/session';

import { SecondFactorClaim, secondFactorCompletedValidator } from './second-factor.claim';
import { SuperTokensSessionSecondFactor } from './supertokens-session-second-factor';

describe('SuperTokensSessionSecondFactor', () => {
  let session: jest.Mocked<
    Pick<SessionContainer, 'getClaimValue' | 'assertClaims' | 'setClaimValue'>
  >;
  let sut: SuperTokensSessionSecondFactor;

  beforeEach(() => {
    session = { getClaimValue: jest.fn(), assertClaims: jest.fn(), setClaimValue: jest.fn() };
    sut = new SuperTokensSessionSecondFactor();
  });

  function asSession(): SessionContainer {
    return session as unknown as SessionContainer;
  }

  describe('isPending', () => {
    it.each([
      ['pendente a sessão com a claim false', false, true],
      ['completa a sessão com a claim true', true, false],
      ['completa a sessão aberta antes de a claim existir', undefined, false],
    ])('deve considerar %s', async (_case, value, pending) => {
      session.getClaimValue.mockResolvedValue(value);

      await expect(sut.isPending(asSession())).resolves.toBe(pending);
      expect(session.getClaimValue).toHaveBeenCalledWith(SecondFactorClaim);
    });
  });

  describe('assertCompleted', () => {
    it('deve conferir a claim da sessão com o validador da segunda etapa', async () => {
      session.assertClaims.mockResolvedValue();

      await expect(sut.assertCompleted(asSession())).resolves.toBeUndefined();
      expect(session.assertClaims).toHaveBeenCalledWith([secondFactorCompletedValidator]);
    });

    it('deve repassar o erro do SuperTokens quando a sessão está pendente', async () => {
      const failure = new Error('INVALID_CLAIMS');
      session.assertClaims.mockRejectedValue(failure);

      await expect(sut.assertCompleted(asSession())).rejects.toBe(failure);
    });
  });

  describe('complete', () => {
    it('deve marcar a claim como verificada na sessão da requisição', async () => {
      session.setClaimValue.mockResolvedValue();

      await sut.complete(asSession());

      expect(session.setClaimValue).toHaveBeenCalledWith(SecondFactorClaim, true);
    });
  });
});
