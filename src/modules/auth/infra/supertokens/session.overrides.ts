import type { Request } from 'express';
import supertokens from 'supertokens-node';
import type { RecipeInterface } from 'supertokens-node/recipe/session/types';

import { buildSessionOrigin } from '@modules/users/infra/identity/session-origin';

/**
 * Guarda o IP e o user agent do login nos dados da sessão no Core (`sessionDataInDatabase`),
 * para o usuário reconhecer cada sessão na listagem (RN23). Os dados ficam só no Core: não vão
 * para o access token.
 *
 * O override fica na função `createNewSession`, por onde passa toda sessão nova. A requisição
 * vem do contexto que o SuperTokens monta ao atender uma rota. A sessão criada fora de uma
 * requisição fica sem a origem, como as abertas antes deste override.
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

      // O SDK tipa os dados da sessão como `any`.
      const sessionData = input.sessionDataInDatabase as Record<string, unknown> | undefined;

      return original.createNewSession({
        ...input,
        sessionDataInDatabase: { ...sessionData, ...origin },
      });
    },
  };
}
