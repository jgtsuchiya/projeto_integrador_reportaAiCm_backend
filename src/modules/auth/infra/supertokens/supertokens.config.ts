import type { SuperTokensConfig } from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';
import UserRoles from 'supertokens-node/recipe/userroles';

import type { Env } from '@config/env.schema';

import {
  buildPasswordField,
  overrideEmailPasswordApis,
  overrideEmailPasswordFunctions,
  SuperTokensHooks,
} from './email-password.overrides';

export type SuperTokensEnv = Pick<
  Env,
  'SUPERTOKENS_CONNECTION_URI' | 'SUPERTOKENS_API_KEY' | 'API_DOMAIN' | 'WEB_APP_URL'
>;

/** Rotas nativas do SuperTokens (signin, refresh, signout...), já com o prefixo global `/api`. */
export const SUPERTOKENS_API_BASE_PATH = '/api/auth';

/**
 * Configuração do `supertokens.init`. As validades dos tokens e o algoritmo de hash da
 * senha são configurados no Core (docker-compose), não aqui.
 *
 * A sessão aceita os tokens por cookie (painel web) e por header (app, com
 * `st-auth-mode: header`), que é o padrão do SDK: na criação da sessão vale o modo pedido
 * pelo front, e na verificação o SDK procura nos dois lugares.
 */
export function buildSuperTokensConfig(
  env: SuperTokensEnv,
  hooks: SuperTokensHooks,
): SuperTokensConfig {
  return {
    framework: 'express',
    supertokens: {
      connectionURI: env.SUPERTOKENS_CONNECTION_URI,
      apiKey: env.SUPERTOKENS_API_KEY,
    },
    appInfo: {
      appName: 'ReportaAi Cm',
      apiDomain: env.API_DOMAIN,
      websiteDomain: env.WEB_APP_URL,
      apiBasePath: SUPERTOKENS_API_BASE_PATH,
    },
    recipeList: [
      EmailPassword.init({
        signUpFeature: { formFields: [buildPasswordField(hooks)] },
        override: {
          functions: overrideEmailPasswordFunctions(hooks),
          apis: overrideEmailPasswordApis(hooks),
        },
      }),
      Session.init(),
      UserRoles.init(),
    ],
  };
}
