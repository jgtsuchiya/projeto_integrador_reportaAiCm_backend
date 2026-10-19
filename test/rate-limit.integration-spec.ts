import { randomUUID } from 'node:crypto';
import { IncomingHttpHeaders, request } from 'node:http';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { Env, envSchema } from '@config/env.schema';
import {
  RATE_LIMIT_MESSAGE,
  RATE_LIMITED_ROUTES,
} from '@modules/auth/presentation/middlewares/rate-limit.middleware';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { deleteLoginAttempts } from './support/login-attempts';

/** Limite baixo, só deste arquivo. O `.env.test` deixa o limite alto para os outros testes. */
const LIMIT = 3;

/** E-mails usados nos logins, para apagar as tentativas registradas no final. */
const emails: string[] = [];

/**
 * Credenciais sem conta: o login responde WRONG_CREDENTIALS_ERROR, e as outras rotas, 400. O
 * e-mail é novo a cada requisição, para as falhas não se somarem até o bloqueio por tentativas.
 */
function buildBody(): string {
  const email = `ratelimit.${randomUUID()}@reportaai.invalid`;
  emails.push(email);

  return JSON.stringify({
    formFields: [
      { id: 'email', value: email },
      { id: 'password', value: 'senha-qualquer-1' },
    ],
  });
}

interface ApiResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

interface TestApp {
  app: INestApplication;
  send: (method: string, path: string, headers?: Record<string, string>) => Promise<ApiResponse>;
}

/** Sobe a API com o limite baixo. O banco só recebe as tentativas de login, apagadas no final. */
async function startApp(trustProxy: number): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  config.set('RATE_LIMIT_MAX_REQUESTS', LIMIT);
  config.set('TRUST_PROXY', trustProxy);
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { hostname, port } = new URL(await app.getUrl());

  /** O caminho vai como está: o `fetch` resolveria os segmentos `.` e `..` antes de enviar. */
  function send(
    method: string,
    path: string,
    headers: Record<string, string> = {},
  ): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      const clientRequest = request(
        {
          hostname,
          port,
          method,
          path,
          headers: { 'content-type': 'application/json', rid: 'emailpassword', ...headers },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      clientRequest.on('error', reject);
      clientRequest.end(method === 'POST' ? buildBody() : undefined);
    });
  }

  return { app, send };
}

describe('Limite de requisições por IP (integração)', () => {
  const env = envSchema.parse(process.env);

  describe('Atrás de um proxy (TRUST_PROXY=1)', () => {
    let api: TestApp;
    let lastIp = 0;

    beforeAll(async () => {
      api = await startApp(1);
    });

    afterAll(async () => {
      await deleteLoginAttempts(api?.app.get(DataSource), emails);
      await api?.app.close();
    });

    /** IP novo a cada teste, para a contagem de um não entrar na de outro. */
    function newIp(): string {
      lastIp += 1;

      return `203.0.113.${lastIp}`;
    }

    function send(
      method: string,
      path: string,
      ip: string,
      headers: Record<string, string> = {},
    ): Promise<ApiResponse> {
      return api.send(method, path, { 'x-forwarded-for': ip, ...headers });
    }

    async function sendTimes(
      times: number,
      method: string,
      path: string,
      ip: string,
    ): Promise<number[]> {
      const statuses: number[] = [];
      for (let count = 0; count < times; count += 1) {
        statuses.push((await send(method, path, ip)).status);
      }

      return statuses;
    }

    it.each(RATE_LIMITED_ROUTES)(
      'deve responder 429 com Retry-After depois do limite de $method $path',
      async ({ method, path }) => {
        const ip = newIp();

        const allowed = await sendTimes(LIMIT, method, path, ip);
        const response = await send(method, path, ip);

        // Nem 429 nem 404: as requisições dentro do limite chegaram à rota.
        expect(allowed).not.toContain(429);
        expect(allowed).not.toContain(404);
        expect(response.status).toBe(429);
        expect(JSON.parse(response.body)).toEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: RATE_LIMIT_MESSAGE,
        });
        const retryAfter = Number(response.headers['retry-after']);
        expect(retryAfter).toBeGreaterThanOrEqual(1);
        expect(retryAfter).toBeLessThanOrEqual(env.RATE_LIMIT_WINDOW_SECONDS);
      },
    );

    it('deve responder o login pelo SuperTokens enquanto o limite não é atingido', async () => {
      const response = await send('POST', '/api/auth/signin', newIp());

      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
      expect(response.headers['retry-after']).toBeUndefined();
    });

    it('não deve consumir o limite de uma rota com as requisições a outra', async () => {
      const ip = newIp();
      await sendTimes(LIMIT, 'POST', '/api/auth/signin', ip);

      const signIn = await send('POST', '/api/auth/signin', ip);
      const register = await send('POST', '/api/clients', ip);

      expect(signIn.status).toBe(429);
      expect(register.status).toBe(400);
    });

    it('não deve consumir o limite da redefinição de senha com os pedidos do link', async () => {
      const ip = newIp();
      await sendTimes(LIMIT, 'POST', '/api/password-resets', ip);

      const request = await send('POST', '/api/password-resets', ip);
      const confirm = await send('POST', '/api/password-resets/confirm', ip);

      expect(request.status).toBe(429);
      expect(confirm.status).toBe(400);
    });

    it('deve contar cada IP em separado', async () => {
      const ip = newIp();
      await sendTimes(LIMIT, 'POST', '/api/auth/signin', ip);

      const sameIp = await send('POST', '/api/auth/signin', ip);
      const otherIp = await send('POST', '/api/auth/signin', newIp());

      expect(sameIp.status).toBe(429);
      expect(otherIp.status).toBe(200);
    });

    it.each([
      ['/api/auth/signin/', '/api/auth/signin'],
      ['/api/auth/public/signin', '/api/auth/signin'],
      ['/api/auth/./signin', '/api/auth/signin'],
      ['/api/auth/session/../signin', '/api/auth/signin'],
      ['/api/auth\\signin', '/api/auth/signin'],
      ['/API/Clients/', '/api/clients'],
      ['/api/Invitations/Accept?origem=email', '/api/invitations/accept'],
      ['/API/Password-Resets/', '/api/password-resets'],
      ['/api/password-resets/confirm?origem=email', '/api/password-resets/confirm'],
    ])('deve contar %s na mesma rota de %s', async (variation, path) => {
      const ip = newIp();

      const first = await send('POST', variation, ip);
      await sendTimes(LIMIT - 1, 'POST', path, ip);
      const blocked = await send('POST', variation, ip);

      // A variação chega à mesma rota, então precisa entrar na mesma contagem.
      expect([404, 429]).not.toContain(first.status);
      expect(blocked.status).toBe(429);
    });

    it.each([
      ['GET', '/api/health', 200],
      ['GET', '/api/users/me', 401],
      ['POST', '/api/auth/session/refresh', 401],
      ['POST', '/api/auth/signout', 401],
    ])('não deve limitar %s %s', async (method, path, status) => {
      const statuses = await sendTimes(LIMIT + 2, method, path, newIp());

      expect(statuses).toEqual(Array(LIMIT + 2).fill(status));
    });

    it('deve responder o 429 com o CORS do painel e o Retry-After exposto', async () => {
      const ip = newIp();
      await sendTimes(LIMIT, 'POST', '/api/auth/signin', ip);

      const response = await send('POST', '/api/auth/signin', ip, { origin: env.WEB_APP_URL });

      expect(response.status).toBe(429);
      expect(response.headers['access-control-allow-origin']).toBe(env.WEB_APP_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-expose-headers']).toContain('retry-after');
    });

    it('não deve contar o preflight do CORS', async () => {
      const ip = newIp();
      const preflight = {
        origin: env.WEB_APP_URL,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,rid,st-auth-mode',
      };
      for (let count = 0; count < LIMIT + 2; count += 1) {
        await send('OPTIONS', '/api/auth/signin', ip, preflight);
      }

      const response = await send('POST', '/api/auth/signin', ip);

      expect(response.status).toBe(200);
    });
  });

  describe('Sem proxy (TRUST_PROXY=0)', () => {
    let api: TestApp;

    beforeAll(async () => {
      api = await startApp(0);
    });

    afterAll(async () => {
      await api?.app.close();
    });

    it('deve contar pelo IP da conexão e ignorar o X-Forwarded-For', async () => {
      for (let count = 1; count <= LIMIT; count += 1) {
        await api.send('POST', '/api/clients', { 'x-forwarded-for': `198.51.100.${count}` });
      }

      const response = await api.send('POST', '/api/clients', {
        'x-forwarded-for': '198.51.100.200',
      });

      expect(response.status).toBe(429);
    });
  });
});
