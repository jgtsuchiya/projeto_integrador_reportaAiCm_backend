import type { Request } from 'express';
import supertokens from 'supertokens-node';
import type { RecipeInterface } from 'supertokens-node/recipe/session/types';
import type { JSONObject } from 'supertokens-node/types';

import { buildSessionOrigin } from '@modules/users/infra/identity/session-origin';

import { SecondFactorClaim } from './second-factor.claim';

/**
 * O que toda sessão nova recebe ao ser criada:
 *
 * - **origem do login (RN23):** o IP e o user agent, nos dados da sessão no Core
 *   (`sessionDataInDatabase`), para o usuário reconhecer cada sessão na listagem. Ficam só no
 *   Core: não vão para o access token;
 * - **segunda etapa (RN25):** a claim `mfa-verified`, no access token, com a decisão que o
 *   override do `signIn` deixou no contexto: `false` (sessão pendente) para quem tem a
 *   verificação em duas etapas ativa e `true` para quem não tem.
 *
 * O override fica na função `createNewSession`, por onde passa toda sessão nova. A requisição
 * vem do contexto que o SuperTokens monta ao atender uma rota. A sessão criada fora de uma
 * requisição fica sem a origem, e a criada fora do login por senha, sem a claim: como as
 * abertas antes deste override, ela vale como completa.
 */
export function overrideSessionFunctions(original: RecipeInterface): RecipeInterface {
  return {
    ...original,
    async createNewSession(input) {
      const request = supertokens.getRequestFromUserContext(input.userContext);
      const origin = buildSessionOrigin({
        // Requisição do Express (`framework: 'express'`). O `ip` já considera o `trust proxy`.
        ipAddress: (request?.original as Request | undefined)?.ip,
        userAgent: request?.getHeaderValue('user-agent'),
      });

      // O SDK tipa os dados da sessão e o payload do access token como `any`.
      const sessionData = input.sessionDataInDatabase as Record<string, unknown> | undefined;
      const accessTokenPayload = input.accessTokenPayload as JSONObject | undefined;
      const secondFactor = await SecondFactorClaim.build(
        input.userId,
        input.recipeUserId,
        input.tenantId,
        accessTokenPayload,
        input.userContext,
      );

      return original.createNewSession({
        ...input,
        accessTokenPayload: { ...accessTokenPayload, ...secondFactor },
        sessionDataInDatabase: { ...sessionData, ...origin },
      });
    },
  };
}
