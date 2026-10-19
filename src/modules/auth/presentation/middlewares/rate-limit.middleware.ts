import { HttpStatus } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { rateLimit, type AugmentedRequest } from 'express-rate-limit';

import type { ErrorResponseBody } from '@shared/presentation/filters/global-exception.filter';

export interface RateLimitedRoute {
  method: string;
  /** Caminho completo, com o prefixo `/api`, em minúsculas e sem parâmetros. */
  path: string;
}

/**
 * Rotas públicas que recebem credenciais ou disparam e-mail (RN18). A lista fica só aqui:
 * uma rota pública nova desse tipo entra nela.
 */
export const RATE_LIMITED_ROUTES: readonly RateLimitedRoute[] = [
  { method: 'POST', path: '/api/auth/signin' },
  { method: 'POST', path: '/api/clients' },
  { method: 'POST', path: '/api/invitations/accept' },
  { method: 'POST', path: '/api/password-resets' },
  { method: 'POST', path: '/api/password-resets/confirm' },
  { method: 'POST', path: '/api/email-verifications/confirm' },
];

export const RATE_LIMIT_MESSAGE = 'Muitas requisições. Tente novamente em instantes.';

export interface RateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
}

/** O SuperTokens também atende as rotas dele com o tenant no caminho: `/api/auth/public/signin`. */
const SUPERTOKENS_TENANT_PATH = /^(\/api\/auth)\/[a-z0-9-]+(\/.+)$/;

/**
 * Limita as requisições por IP em cada rota de `RATE_LIMITED_ROUTES`. As outras rotas passam
 * direto. Cada rota tem a própria contagem, que fica em memória: com mais de uma instância da
 * API, cada instância conta as suas.
 */
export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  const windowMs = options.windowSeconds * 1000;
  const limiters = new Map(
    RATE_LIMITED_ROUTES.map((route) => [
      route,
      rateLimit({
        windowMs,
        limit: options.maxRequests,
        // Só o Retry-After vai na resposta, escrito no handler.
        standardHeaders: false,
        legacyHeaders: false,
        handler: (request, response) => {
          const { resetTime } = (request as AugmentedRequest).rateLimit;
          const body: ErrorResponseBody = {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: RATE_LIMIT_MESSAGE,
          };

          response
            .status(body.statusCode)
            .set('Retry-After', String(secondsUntil(resetTime, windowMs)))
            .json(body);
        },
      }),
    ]),
  );

  return (request, response, next) => {
    const route = findRateLimitedRoute(request.method, request.originalUrl);
    const limiter = route && limiters.get(route);

    if (!limiter) {
      next();
      return;
    }

    return limiter(request, response, next);
  };
}

/** A rota limitada que vai atender a requisição, se houver. */
export function findRateLimitedRoute(method: string, url: string): RateLimitedRoute | undefined {
  const path = normalizePath(url);
  if (path === undefined) {
    return undefined;
  }

  const paths = [path, path.replace(SUPERTOKENS_TENANT_PATH, '$1$2')];

  return RATE_LIMITED_ROUTES.find((route) => route.method === method && paths.includes(route.path));
}

/**
 * Lê o caminho como os roteadores que vêm depois: o Express ignora as maiúsculas e a barra
 * final, e o SuperTokens resolve os segmentos `.` e `..`. Sem isso, `/api/auth/./signin` ou
 * `/API/clients/` chegariam à rota sem passar pelo limite.
 */
function normalizePath(url: string): string | undefined {
  try {
    return new URL(url, 'http://localhost').pathname.toLowerCase().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function secondsUntil(resetTime: Date | undefined, windowMs: number): number {
  const remainingMs = resetTime ? resetTime.getTime() - Date.now() : windowMs;

  return Math.max(1, Math.ceil(remainingMs / 1000));
}
