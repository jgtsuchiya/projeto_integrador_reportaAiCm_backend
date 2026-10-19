import type request from 'supertest';

import { PASSWORD_CHANGED_MAIL_SUBJECT } from '@modules/users/application/services/password-changed-notice';
import { PASSWORD_RESET_MAIL_SUBJECT } from '@modules/users/application/services/password-reset.service';
import { InvalidUserTokenError } from '@modules/users/domain/errors/invalid-user-token.error';

import { Actor, E2eApp, readTokens, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;
const NEW_PASSWORD = 'senha-nova-2';

/** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
describe('Recuperação de senha (e2e)', () => {
  let e2e: E2eApp;
  let client: Actor;
  /** Sessão aberta em outro aparelho antes da redefinição. */
  let otherDevice: Tokens;
  let token: string;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
    client = await e2e.registerClient();
    otherDevice = await e2e.logIn(client);
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function confirm(password: string): request.Test {
    return e2e.api().post('/api/password-resets/confirm').send({ token, password });
  }

  it('deve responder 204 ao pedido, sem sessão, e enviar o link por e-mail', async () => {
    const response = await e2e.api().post('/api/password-resets').send({ email: client.email });
    // A rota responde antes de enviar o e-mail (RN20).
    await e2e.waitForBackgroundTasks();

    expect(response.status).toBe(204);
    expect(e2e.mailSender.messages.at(-1)).toMatchObject({
      to: client.email,
      subject: PASSWORD_RESET_MAIL_SUBJECT,
    });
    token = e2e.lastLinkToken(client.email, '/redefinir-senha');
  });

  it('deve redefinir a senha com o token do link e avisar da troca por e-mail', async () => {
    const response = await confirm(NEW_PASSWORD);

    expect(response.status).toBe(204);
    expect(e2e.mailSender.messages.at(-1)).toMatchObject({
      to: client.email,
      subject: PASSWORD_CHANGED_MAIL_SUBJECT,
    });
  });

  it('deve encerrar todas as sessões abertas antes da redefinição', async () => {
    const responses = await Promise.all([
      e2e.refresh(client.refreshToken),
      e2e.refresh(otherDevice.refreshToken),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([401, 401]);
  });

  it('deve recusar a senha antiga e aceitar a nova no login', async () => {
    const old = await e2e.signIn(client.email, client.password);

    const response = await e2e.signIn(client.email, NEW_PASSWORD);

    expect(old.body).toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
    expect(response.body).toMatchObject({ status: 'OK', user: { id: client.id } });
    // O Client nasce com o e-mail não verificado, e o link prova a posse dele (RN21).
    const profile = await e2e
      .api()
      .get('/api/users/me')
      .auth(readTokens(response).accessToken, BEARER);
    expect(profile.body).toMatchObject({ emailVerifiedAt: expect.any(String) as string });
  });

  it('deve recusar o mesmo link uma segunda vez', async () => {
    const response = await confirm('senha-nova-3');

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ message: new InvalidUserTokenError().message });
  });
});
