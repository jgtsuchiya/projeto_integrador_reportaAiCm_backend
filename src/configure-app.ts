import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Application } from 'express';
import supertokens from 'supertokens-node';

import { Env } from '@config/env.schema';
import { createRateLimitMiddleware } from '@modules/auth/presentation/middlewares/rate-limit.middleware';
import { reportsBodyLimitBytes } from '@modules/reports/presentation/dtos/report-photo.dto';
import {
  createJsonBodyParser,
  createUrlencodedBodyParser,
  DEFAULT_BODY_LIMIT_BYTES,
} from '@shared/presentation/middlewares/body-parser.middleware';

/**
 * Configuração da aplicação que não cabe no AppModule. Usada pelo `main.ts` e pelos testes
 * que sobem a API, para que os dois tenham o mesmo prefixo, o mesmo CORS, o mesmo limite
 * por IP e os mesmos limites do corpo.
 *
 * Precisa ser chamada antes do `init`/`listen`: o CORS e o limite por IP têm de ser
 * registrados antes do middleware do SuperTokens. Sem isso, o preflight das rotas `/api/auth`
 * não recebe os headers, e o login é respondido sem passar pelo limite.
 *
 * A aplicação é criada com `bodyParser: false`: os parsers do corpo são registrados aqui, com
 * o limite de cada rota.
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
  // Depois do limite por IP, que barra o pedido sem ler o corpo. As rotas de reportes recebem a
  // foto em base64 e têm um limite calculado a partir dos tamanhos máximos das imagens. O
  // primeiro parser que lê o corpo vale: os seguintes não leem de novo.
  app.use(
    '/api/reports',
    createJsonBodyParser(
      reportsBodyLimitBytes({
        photoMaxBytes: config.get('REPORT_PHOTO_MAX_BYTES', { infer: true }),
        thumbnailMaxBytes: config.get('REPORT_THUMBNAIL_MAX_BYTES', { infer: true }),
      }),
    ),
  );
  app.use(
    createJsonBodyParser(DEFAULT_BODY_LIMIT_BYTES),
    createUrlencodedBodyParser(DEFAULT_BODY_LIMIT_BYTES),
  );
  app.enableShutdownHooks();
}
