import { RecipeUserId } from 'supertokens-node';
import type { UserContext } from 'supertokens-node/types';

import {
  SECOND_FACTOR_CLAIM_KEY,
  SecondFactorClaim,
  secondFactorCompletedValidator,
  setSecondFactorRequired,
} from './second-factor.claim';

const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';

function newContext(): UserContext {
  return {} as UserContext;
}

describe('SecondFactorClaim', () => {
  function fetchValue(userContext: UserContext): unknown {
    return SecondFactorClaim.fetchValue(
      USER_ID,
      new RecipeUserId(USER_ID),
      'public',
      {},
      userContext,
    );
  }

  it('deve usar a chave mfa-verified, sem validade', () => {
    expect(SecondFactorClaim.key).toBe('mfa-verified');
    expect(SECOND_FACTOR_CLAIM_KEY).toBe('mfa-verified');
    expect(SecondFactorClaim.defaultMaxAgeInSeconds).toBeUndefined();
  });

  it.each([
    ['false (pendente) quando o login pede a segunda etapa', true, false],
    ['true (completa) quando o login não pede a segunda etapa', false, true],
  ])('deve nascer %s', (_case, required, value) => {
    const userContext = newContext();
    setSecondFactorRequired(userContext, required);

    expect(fetchValue(userContext)).toBe(value);
  });

  it('não deve dar valor fora do login, para a claim não ser alterada', () => {
    expect(fetchValue(newContext())).toBeUndefined();
  });

  it('deve guardar a decisão de um login sem afetar o contexto de outro', () => {
    const first = newContext();
    const second = newContext();

    setSecondFactorRequired(first, true);

    expect(fetchValue(first)).toBe(false);
    expect(fetchValue(second)).toBeUndefined();
  });
});

describe('secondFactorCompletedValidator', () => {
  function validate(payload: object): ReturnType<typeof secondFactorCompletedValidator.validate> {
    return secondFactorCompletedValidator.validate(payload, newContext());
  }

  it('deve se identificar pela chave da claim e nunca buscar o valor de novo', () => {
    expect(secondFactorCompletedValidator.id).toBe('mfa-verified');
    expect(secondFactorCompletedValidator).not.toHaveProperty('claim');
    expect(secondFactorCompletedValidator).not.toHaveProperty('shouldRefetch');
  });

  it('deve recusar a sessão pendente, com o motivo no formato do SDK', async () => {
    const payload = SecondFactorClaim.addToPayload_internal({}, false, newContext()) as object;

    await expect(validate(payload)).resolves.toEqual({
      isValid: false,
      reason: { message: 'wrong value', expectedValue: true, actualValue: false },
    });
  });

  it('deve aceitar a sessão que concluiu a segunda etapa', async () => {
    const payload = SecondFactorClaim.addToPayload_internal({}, true, newContext()) as object;

    await expect(validate(payload)).resolves.toEqual({ isValid: true });
  });

  it('deve aceitar a sessão aberta antes de a claim existir', async () => {
    await expect(validate({ sessionHandle: 'session-1' })).resolves.toEqual({ isValid: true });
  });
});
