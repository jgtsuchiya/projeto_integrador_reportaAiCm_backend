import type request from 'supertest';

import { EMAIL_VERIFICATION_MAIL_SUBJECT } from '@modules/users/application/services/email-verification.service';
import { EmailAlreadyVerifiedError } from '@modules/users/domain/errors/email-already-verified.error';
import { InvalidUserTokenError } from '@modules/users/domain/errors/invalid-user-token.error';

import { Actor, E2eApp, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

describe('Verificação de e-mail (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function getProfile(session: Tokens): request.Test {
    return e2e.api().get('/api/users/me').auth(session.accessToken, BEARER);
  }

  function confirm(token: string): request.Test {
    return e2e.api().post('/api/email-verifications/confirm').send({ token });
  }

  function resend(session: Tokens): request.Test {
    return e2e.api().post('/api/users/me/email-verification').auth(session.accessToken, BEARER);
  }

  /** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
  describe('Cadastro e confirmação', () => {
    let client: Actor;
    let token: string;

    it('deve cadastrar o Client com o e-mail não verificado e enviar o link por e-mail', async () => {
      client = await e2e.registerClient();

      const response = await getProfile(client);

      expect(response.body).toMatchObject({ id: client.id, emailVerifiedAt: null });
      expect(e2e.mailSender.messages.at(-1)).toMatchObject({
        to: client.email,
        subject: EMAIL_VERIFICATION_MAIL_SUBJECT,
      });
      token = e2e.lastLinkToken(client.email, '/verificar-email');
    });

    it('deve confirmar o e-mail com o token do link, sem sessão', async () => {
      const response = await confirm(token);

      expect(response.status).toBe(204);
      const profile = await getProfile(client);
      expect(profile.body).toMatchObject({ emailVerifiedAt: expect.any(String) as string });
    });

    it('deve recusar o mesmo link uma segunda vez', async () => {
      const response = await confirm(token);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: new InvalidUserTokenError().message });
    });

    it('deve recusar o reenvio para quem já verificou o e-mail', async () => {
      // Sem o intervalo de 1 minuto, o 422 seria o do e-mail recente.
      await e2e.passResendInterval(client.id);

      const response = await resend(client);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: new EmailAlreadyVerifiedError().message });
    });
  });

  describe('Reenvio', () => {
    it('deve enviar um link novo, que invalida o anterior', async () => {
      const client = await e2e.registerClient();
      const first = e2e.lastLinkToken(client.email, '/verificar-email');
      await e2e.passResendInterval(client.id);

      const response = await resend(client);

      expect(response.status).toBe(204);
      const second = e2e.lastLinkToken(client.email, '/verificar-email');
      expect(second).not.toBe(first);
      await expect(confirm(first)).resolves.toHaveProperty('status', 422);
      await expect(confirm(second)).resolves.toHaveProperty('status', 204);
      const profile = await getProfile(client);
      expect(profile.body).toMatchObject({ emailVerifiedAt: expect.any(String) as string });
    });
  });
});
