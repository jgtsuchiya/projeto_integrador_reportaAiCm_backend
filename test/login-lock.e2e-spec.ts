import { envSchema } from '@config/env.schema';
import { LOGIN_LOCKED_MESSAGE } from '@modules/auth/infra/supertokens/email-password.overrides';

import { Actor, E2eApp, readTokens } from './support/e2e-app';

const WRONG_PASSWORD = 'senha-errada-1';
const NEW_PASSWORD = 'senha-nova-2';
const WRONG_CREDENTIALS = { status: 'WRONG_CREDENTIALS_ERROR' };

/** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
describe('Bloqueio do login por tentativas (e2e)', () => {
  const MAX_FAILURES = envSchema.parse(process.env).LOGIN_MAX_FAILED_ATTEMPTS;
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

  it('deve recusar a senha errada em cada tentativa até o limite', async () => {
    const bodies: unknown[] = [];

    for (let count = 0; count < MAX_FAILURES; count += 1) {
      bodies.push((await e2e.signIn(client.email, WRONG_PASSWORD)).body);
    }

    expect(bodies).toEqual(Array.from({ length: MAX_FAILURES }, () => WRONG_CREDENTIALS));
  });

  it('deve bloquear o login depois do limite, mesmo com a senha correta (RN17)', async () => {
    const response = await e2e.signIn(client.email, client.password);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'GENERAL_ERROR', message: LOGIN_LOCKED_MESSAGE });
    expect(readTokens(response).accessToken).toBe('');
  });

  it('deve liberar o login pela redefinição de senha (RN21)', async () => {
    await e2e.api().post('/api/password-resets').send({ email: client.email });
    await e2e.waitForBackgroundTasks();
    const reset = await e2e
      .api()
      .post('/api/password-resets/confirm')
      .send({
        token: e2e.lastLinkToken(client.email, '/redefinir-senha'),
        password: NEW_PASSWORD,
      });

    const response = await e2e.signIn(client.email, NEW_PASSWORD);

    expect(reset.status).toBe(204);
    expect(response.body).toMatchObject({ status: 'OK', user: { id: client.id } });
    expect(readTokens(response).accessToken).not.toBe('');
  });
});
