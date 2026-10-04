import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertokens from 'supertokens-node';

import { Env } from '@config/env.schema';

/**
 * Configuração da aplicação que não cabe no AppModule. Usada pelo `main.ts` e pelos testes
 * que sobem a API, para que os dois tenham o mesmo prefixo e o mesmo CORS.
 *
 * Precisa ser chamada antes do `init`/`listen`: o CORS tem de ser registrado antes do
 * middleware do SuperTokens, senão o preflight das rotas `/api/auth` não recebe os headers.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get('WEB_APP_URL', { infer: true }),
    // O painel web usa cookies de sessão. O app mobile usa headers e não passa pelo CORS.
    credentials: true,
    allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
  });
  app.enableShutdownHooks();
}
