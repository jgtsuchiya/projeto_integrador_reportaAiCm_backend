import type { NextFunction, Request, RequestHandler, Response } from 'express';

import {
  createRateLimitMiddleware,
  findRateLimitedRoute,
  RATE_LIMIT_MESSAGE,
  RATE_LIMITED_ROUTES,
} from './rate-limit.middleware';

const LIMIT = 3;
const WINDOW_SECONDS = 60;
const IP = '203.0.113.10';

function buildRequest(method: string, originalUrl: string, ip = IP): Request {
  return {
    method,
    originalUrl,
    ip,
    headers: {},
    socket: { remoteAddress: ip },
    app: { get: () => 0 },
  } as unknown as Request;
}

interface ResponseDouble {
  response: Response;
  status: jest.Mock;
  set: jest.Mock;
  json: jest.Mock;
}

function buildResponse(): ResponseDouble {
  const status = jest.fn().mockReturnThis();
  const set = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();

  return { response: { status, set, json } as unknown as Response, status, set, json };
}

describe('findRateLimitedRoute', () => {
  it.each(RATE_LIMITED_ROUTES)('deve encontrar a rota $method $path', (route) => {
    const result = findRateLimitedRoute(route.method, route.path);

    expect(result).toBe(route);
  });

  it.each([
    ['com query string', '/api/auth/signin?next=1', '/api/auth/signin'],
    ['com barra final', '/api/clients/', '/api/clients'],
    ['com mais de uma barra final', '/api/auth/signin//', '/api/auth/signin'],
    ['com maiúsculas', '/API/Invitations/Accept', '/api/invitations/accept'],
    ['com o segmento "."', '/api/auth/./signin', '/api/auth/signin'],
    ['com o segmento ".."', '/api/auth/session/../signin', '/api/auth/signin'],
    ['com o segmento "." codificado', '/api/auth/%2e/signin', '/api/auth/signin'],
    ['com barra invertida', '/api/auth\\signin', '/api/auth/signin'],
    ['com o tenant do SuperTokens', '/api/auth/public/signin', '/api/auth/signin'],
    ['com o tenant em maiúsculas e barra final', '/api/auth/Public/signin/', '/api/auth/signin'],
  ])('deve encontrar a rota no caminho %s', (_case, url, path) => {
    const result = findRateLimitedRoute('POST', url);

    expect(result).toEqual({ method: 'POST', path });
  });

  it.each([
    ['GET', '/api/clients'],
    ['OPTIONS', '/api/auth/signin'],
    ['GET', '/api/health'],
    ['GET', '/api/users/me'],
    ['POST', '/api/admins'],
    ['POST', '/api/auth/session/refresh'],
    ['POST', '/api/auth/signout'],
    ['POST', '/api/clients/5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b'],
    ['POST', '/api/auth/public/outro/signin'],
    ['POST', '/api/public/clients'],
    ['POST', 'http://['],
  ])('não deve encontrar rota limitada em %s %s', (method, url) => {
    const result = findRateLimitedRoute(method, url);

    expect(result).toBeUndefined();
  });
});

describe('createRateLimitMiddleware', () => {
  let sut: RequestHandler;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    // O contador da janela usa o relógio, então o middleware é criado já com o relógio falso.
    jest.useFakeTimers();
    sut = createRateLimitMiddleware({ maxRequests: LIMIT, windowSeconds: WINDOW_SECONDS });
    next = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function call(method: string, url: string, ip = IP): Promise<ResponseDouble> {
    const double = buildResponse();
    await sut(buildRequest(method, url, ip), double.response, next);

    return double;
  }

  async function reachLimit(url: string, ip = IP): Promise<void> {
    for (let count = 0; count < LIMIT; count += 1) {
      await call('POST', url, ip);
    }
  }

  it('deve deixar passar as requisições até o limite', async () => {
    await reachLimit('/api/auth/signin');

    expect(next).toHaveBeenCalledTimes(LIMIT);
    expect(next).toHaveBeenCalledWith();
  });

  it('deve responder 429 no formato de erro da aplicação, com o Retry-After', async () => {
    await reachLimit('/api/auth/signin');
    next.mockClear();

    const { status, set, json } = await call('POST', '/api/auth/signin');

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
    expect(set).toHaveBeenCalledWith('Retry-After', String(WINDOW_SECONDS));
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      error: 'Too Many Requests',
      message: RATE_LIMIT_MESSAGE,
    });
  });

  it('deve informar no Retry-After o tempo que falta para a janela acabar', async () => {
    await reachLimit('/api/clients');
    jest.advanceTimersByTime(45_500);

    const { set } = await call('POST', '/api/clients');

    expect(set).toHaveBeenCalledWith('Retry-After', '15');
  });

  it('deve voltar a aceitar as requisições quando a janela passa', async () => {
    await reachLimit('/api/clients');
    jest.advanceTimersByTime(WINDOW_SECONDS * 1000);
    next.mockClear();

    const { status } = await call('POST', '/api/clients');

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('deve contar cada rota em separado', async () => {
    await reachLimit('/api/auth/signin');
    next.mockClear();

    const { status } = await call('POST', '/api/clients');

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('deve contar cada IP em separado', async () => {
    await reachLimit('/api/auth/signin');
    next.mockClear();

    const { status } = await call('POST', '/api/auth/signin', '203.0.113.11');

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('deve contar na mesma rota as variações do caminho', async () => {
    await call('POST', '/api/auth/signin/');
    await call('POST', '/api/auth/public/signin');
    await call('POST', '/api/auth/./signin');
    next.mockClear();

    const { status } = await call('POST', '/api/auth/signin');

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(429);
  });

  it('não deve limitar as rotas que estão fora da lista', async () => {
    for (let count = 0; count < LIMIT + 2; count += 1) {
      await call('POST', '/api/auth/session/refresh');
      await call('GET', '/api/health');
    }

    expect(next).toHaveBeenCalledTimes(2 * (LIMIT + 2));
  });
});
