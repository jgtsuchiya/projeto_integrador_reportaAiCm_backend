import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Application } from 'express';
import supertokens from 'supertokens-node';

import { Env } from '@config/env.schema';
import { createRateLimitMiddleware } from '@modules/auth/presentation/middlewares/rate-limit.middleware';

/**
 * Configuração da aplicação que não cabe no AppModule. Usada pelo `main.ts` e pelos testes
 * que sobem a API, para que os dois tenham o mesmo prefixo, o mesmo CORS e o mesmo limite
 * por IP.
 *
 * Precisa ser chamada antes do `init`/`listen`: o CORS e o limite por IP têm de ser
 * registrados antes do middleware do SuperTokens. Sem isso, o preflight das rotas `/api/auth`
 * não recebe os headers, e o login é respondido sem passar pelo limite.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const express = app.getHttpAdapter().getInstance() as Application;

  app.setGlobalPrefix('api');
  // Atrás de um proxy reverso, o IP do cliente vem do X-Forwarded-For.
  express.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.enableCors({
    origin: config.get('WEB_APP_URL', { infer: true }),
    // O painel web usa cookies de sessão. O app mobile usa headers e não passa pelo CORS.
    credentials: true,
    allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
    // Sem isso, o painel não consegue ler o Retry-After do 429.
    exposedHeaders: ['retry-after'],
  });
  // Depois do CORS, para o 429 também sair com os headers dele.
  app.use(
    createRateLimitMiddleware({
      maxRequests: config.get('RATE_LIMIT_MAX_REQUESTS', { infer: true }),
      windowSeconds: config.get('RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
    }),
  );
  app.enableShutdownHooks();
}
