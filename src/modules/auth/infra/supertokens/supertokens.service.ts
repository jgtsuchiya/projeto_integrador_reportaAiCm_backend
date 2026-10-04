import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertokens from 'supertokens-node';

import { Env } from '@config/env.schema';
import { AuthorizeSignInUseCase } from '@modules/users/application/use-cases/authorize-sign-in.use-case';
import { CheckPasswordPolicyUseCase } from '@modules/users/application/use-cases/check-password-policy.use-case';

import { buildSuperTokensConfig } from './supertokens.config';

/**
 * Inicializa o SDK do SuperTokens.
 *
 * O `init` roda no construtor, e não no `onModuleInit`, porque o `main.ts` precisa do SDK
 * pronto logo depois do `NestFactory.create`, para montar o CORS com
 * `supertokens.getAllCORSHeaders()` antes de a aplicação registrar os middlewares.
 * O SDK guarda uma instância global, então chamadas seguintes são ignoradas.
 */
@Injectable()
export class SuperTokensService {
  constructor(
    config: ConfigService<Env, true>,
    authorizeSignIn: AuthorizeSignInUseCase,
    checkPasswordPolicy: CheckPasswordPolicyUseCase,
  ) {
    supertokens.init(
      buildSuperTokensConfig(
        {
          SUPERTOKENS_CONNECTION_URI: config.get('SUPERTOKENS_CONNECTION_URI', { infer: true }),
          SUPERTOKENS_API_KEY: config.get('SUPERTOKENS_API_KEY', { infer: true }),
          API_DOMAIN: config.get('API_DOMAIN', { infer: true }),
          WEB_APP_URL: config.get('WEB_APP_URL', { infer: true }),
        },
        {
          authorizeSignIn: async (userId) => (await authorizeSignIn.execute({ userId })).allowed,
          checkPasswordPolicy: (password) => checkPasswordPolicy.execute(password),
        },
      ),
    );
  }
}
