import { Controller, Get, INestApplication, Req, Res } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import Session from 'supertokens-node/recipe/session';

import { envSchema } from '@config/env.schema';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

/** Rota só de teste: lança o erro do SuperTokens de quando não há sessão. */
@Controller('test-session')
class SessionProbeController {
  @Get()
  async probe(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await Session.getSession(req, res);
  }
}

describe('SuperTokens (integração)', () => {
  const env = envSchema.parse(process.env);
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // Proteção: o AppModule conecta ao banco; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('deve alcançar o SuperTokens Core', async () => {
    const response = await fetch(new URL('/hello', env.SUPERTOKENS_CONNECTION_URI));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('Hello');
  });

  it('deve responder o signin no formato do SuperTokens', async () => {
    const response = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', rid: 'emailpassword' },
      body: JSON.stringify({
        formFields: [
          { id: 'email', value: 'ninguem@reportaai.invalid' },
          { id: 'password', value: 'senha-qualquer-1' },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
  });

  it('deve liberar no CORS o painel web e os headers do SuperTokens', async () => {
    const response = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'OPTIONS',
      headers: {
        origin: env.WEB_APP_URL,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,rid,st-auth-mode',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(env.WEB_APP_URL);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-headers')).toEqual(
      expect.stringContaining('st-auth-mode'),
    );
  });

  it('deve responder os erros de sessão pelo filtro do SuperTokens', async () => {
    const response = await fetch(`${baseUrl}/api/test-session`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'unauthorised' });
  });

  it('deve manter as rotas da aplicação funcionando', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
  });
});
