import type { SessionClaimValidator } from 'supertokens-node/recipe/session';
import { BooleanClaim } from 'supertokens-node/recipe/session/claims';
import type { JSONObject, UserContext } from 'supertokens-node/types';

export const SECOND_FACTOR_CLAIM_KEY = 'mfa-verified';

/** Onde o override do `signIn` deixa a decisão para o `createNewSession` da mesma requisição. */
const USER_CONTEXT_KEY = 'secondFactorRequired';

/**
 * Guarda, no contexto que o SuperTokens leva por toda a requisição do login, se o usuário
 * precisa da segunda etapa. É assim que o override do `signIn`, que conhece a decisão, avisa o
 * `createNewSession`, que grava a claim.
 */
export function setSecondFactorRequired(userContext: UserContext, required: boolean): void {
  (userContext as Record<string, unknown>)[USER_CONTEXT_KEY] = required;
}

function readSecondFactorRequired(userContext: UserContext): boolean | undefined {
  const required = (userContext as Record<string, unknown>)[USER_CONTEXT_KEY];

  return typeof required === 'boolean' ? required : undefined;
}

/**
 * Claim da segunda etapa do login (RN25), no access token: `false` enquanto a sessão está
 * pendente e `true` quando o código foi conferido, ou quando o login não precisou dele.
 *
 * O `fetchValue` só dá o valor inicial, na criação da sessão, a partir da decisão do login.
 * Fora do login ele não tem o que dizer e devolve `undefined`, que o SDK entende como "não
 * mexer na claim". Por isso a claim não tem validade (`defaultMaxAgeInSeconds`) e nunca é
 * buscada de novo: quem a muda para `true` é só a conferência do código.
 */
export const SecondFactorClaim = new BooleanClaim({
  key: SECOND_FACTOR_CLAIM_KEY,
  fetchValue: (_userId, _recipeUserId, _tenantId, _currentPayload, userContext) => {
    const required = readSecondFactorRequired(userContext);

    return required === undefined ? undefined : !required;
  },
});

/**
 * Recusa a sessão pendente, com o mesmo motivo dos validadores do SDK. A sessão sem a claim
 * passa: é uma sessão aberta antes de a segunda etapa existir, que continua valendo.
 *
 * Não usa o `SecondFactorClaim.validators.isTrue()`: ele tentaria buscar o valor da claim que
 * falta e recusaria essas sessões.
 */
export const secondFactorCompletedValidator: SessionClaimValidator = {
  id: SECOND_FACTOR_CLAIM_KEY,
  validate: async (payload: JSONObject, userContext) =>
    SecondFactorClaim.getValueFromPayload(payload, userContext) === false
      ? {
          isValid: false,
          reason: { message: 'wrong value', expectedValue: true, actualValue: false },
        }
      : { isValid: true },
};
