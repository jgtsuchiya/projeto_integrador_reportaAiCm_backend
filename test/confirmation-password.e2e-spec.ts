import type request from 'supertest';

import { Actor, E2eApp } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;
const WRONG_PASSWORD = 'senha-errada-1';

/**
 * A senha de confirmação errada responde 422, e não 401. Os SDKs do SuperTokens tratam todo 401
 * como sessão vencida: renovariam a sessão e repetiriam a chamada até 10 vezes, sem nunca
 * entregar ao front o erro do campo.
 */
describe('Senha de confirmação incorreta (e2e)', () => {
  let e2e: E2eApp;
  let client: Actor;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
    client = await e2e.registerClient();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it.each<[string, (actor: Actor) => request.Test, string]>([
    [
      'PATCH /api/users/me/password',
      (actor) =>
        e2e
          .api()
          .patch('/api/users/me/password')
          .auth(actor.accessToken, BEARER)
          .send({ currentPassword: WRONG_PASSWORD, newPassword: 'senha-nova-1' }),
      'currentPassword',
    ],
    [
      'PATCH /api/users/me/mfa',
      (actor) =>
        e2e
          .api()
          .patch('/api/users/me/mfa')
          .auth(actor.accessToken, BEARER)
          .send({ enabled: true, password: WRONG_PASSWORD }),
      'password',
    ],
    [
      'DELETE /api/users/me',
      (actor) =>
        e2e
          .api()
          .delete('/api/users/me')
          .auth(actor.accessToken, BEARER)
          .send({ password: WRONG_PASSWORD }),
      'password',
    ],
  ])('deve responder 422 em %s, com o campo da senha', async (_route, call, field) => {
    const response = await call(client);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Senha incorreta.',
      details: { field },
    });
  });

  it('deve manter a sessão depois das senhas erradas, sem precisar de refresh', async () => {
    const profile = await e2e.api().get('/api/users/me').auth(client.accessToken, BEARER);
    expect(profile.status).toBe(200);

    const refresh = await e2e.refresh(client.refreshToken);
    expect(refresh.status).toBe(200);
  });
});
