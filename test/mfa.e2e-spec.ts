import type request from 'supertest';

import { LOGIN_CODE_MAIL_SUBJECT } from '@modules/users/application/services/login-code.service';
import { EmailNotVerifiedError } from '@modules/users/domain/errors/email-not-verified.error';
import { EmailRecentlySentError } from '@modules/users/domain/errors/email-recently-sent.error';
import { InvalidLoginCodeError } from '@modules/users/domain/errors/invalid-login-code.error';

import { Actor, E2eApp, readTokens, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

/** Um código de 6 dígitos diferente do informado. */
function otherCode(code: string): string {
  return code === '000000' ? '000001' : '000000';
}

describe('Verificação em duas etapas (e2e)', () => {
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

  function changeMfa(actor: Actor, enabled: boolean): request.Test {
    return e2e
      .api()
      .patch('/api/users/me/mfa')
      .auth(actor.accessToken, BEARER)
      .send({ enabled, password: actor.password });
  }

  function verifyCode(session: Tokens, code: string): request.Test {
    return e2e.api().post('/api/mfa/verify').auth(session.accessToken, BEARER).send({ code });
  }

  function resendCode(session: Tokens): request.Test {
    return e2e.api().post('/api/mfa/code').auth(session.accessToken, BEARER);
  }

  /** E-mails com o código da segunda etapa enviados ao endereço. */
  function codeMailsSentTo(email: string): number {
    return e2e.mailSender.messages.filter(
      ({ to, subject }) => to === email && subject === LOGIN_CODE_MAIL_SUBJECT,
    ).length;
  }

  /** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
  describe('Ativação e login com o código', () => {
    let client: Actor;
    /** Sessão aberta em outro aparelho antes da ativação. */
    let otherDevice: Tokens;
    let lastLoginAt: string;
    let session: Tokens;

    beforeAll(async () => {
      client = await e2e.registerClient();
      otherDevice = await e2e.logIn(client);
    });

    it('deve recusar a ativação enquanto o e-mail não foi verificado (RN24)', async () => {
      const response = await changeMfa(client, true);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: new EmailNotVerifiedError().message });
    });

    it('deve ativar depois da confirmação do e-mail, revogando as outras sessões', async () => {
      await e2e
        .api()
        .post('/api/email-verifications/confirm')
        .send({ token: e2e.lastLinkToken(client.email, '/verificar-email') });

      const response = await changeMfa(client, true);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: client.id, mfaEnabled: true });
      lastLoginAt = (response.body as { lastLoginAt: string }).lastLoginAt;
      // A sessão que ativou continua completa, sem pedir o código.
      const profile = await getProfile(client);
      expect(profile.status).toBe(200);
      const refresh = await e2e.refresh(otherDevice.refreshToken);
      expect(refresh.status).toBe(401);
    });

    it('deve abrir uma sessão pendente no login e enviar o código por e-mail', async () => {
      const response = await e2e.signIn(client.email, client.password);

      expect(response.body).toMatchObject({ status: 'OK', user: { id: client.id } });
      session = readTokens(response);
      expect(codeMailsSentTo(client.email)).toBe(1);
      // O login ainda não foi concluído (RN25).
      const profile = await getProfile(client);
      expect(profile.body).toMatchObject({ lastLoginAt });
    });

    it('deve responder 403 à sessão pendente fora das rotas da segunda etapa', async () => {
      const responses = await Promise.all([
        getProfile(session),
        e2e.api().get('/api/users/me/sessions').auth(session.accessToken, BEARER),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([403, 403]);
      expect(responses.map(({ body }) => body as unknown)).toEqual([
        expect.objectContaining({ message: 'invalid claim' }),
        expect.objectContaining({ message: 'invalid claim' }),
      ]);
    });

    it('deve recusar um código errado, sem liberar a sessão', async () => {
      const response = await verifyCode(session, otherCode(e2e.lastLoginCode(client.email)));

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: new InvalidLoginCodeError().message });
      const profile = await getProfile(session);
      expect(profile.status).toBe(403);
    });

    it('deve concluir o login com o código do e-mail e liberar o acesso', async () => {
      const response = await verifyCode(session, e2e.lastLoginCode(client.email));

      expect(response.status).toBe(204);
      // O access token atualizado volta na resposta. O refresh token continua o mesmo.
      session = { ...session, accessToken: response.get('st-access-token') ?? '' };
      const profile = await getProfile(session);
      expect(profile.status).toBe(200);
      const { lastLoginAt: completedAt } = profile.body as { lastLoginAt: string };
      expect(Date.parse(completedAt)).toBeGreaterThan(Date.parse(lastLoginAt));
    });

    it('deve manter a sessão completa depois do refresh', async () => {
      const response = await e2e.refresh(session.refreshToken);

      expect(response.status).toBe(200);
      const profile = await getProfile(readTokens(response));
      expect(profile.status).toBe(200);
    });
  });

  it('deve reenviar o código depois do intervalo de 1 minuto, e o novo conclui o login', async () => {
    const client = await e2e.registerClientWithMfa();
    const pending = await e2e.logIn(client);
    const early = await resendCode(pending);
    await e2e.passResendInterval(client.id);

    const response = await resendCode(pending);

    expect(early.status).toBe(422);
    expect(early.body).toMatchObject({ message: new EmailRecentlySentError().message });
    expect(response.status).toBe(204);
    expect(codeMailsSentTo(client.email)).toBe(2);
    const verify = await verifyCode(pending, e2e.lastLoginCode(client.email));
    expect(verify.status).toBe(204);
  });

  it('deve desativar com a senha atual, e o login seguinte não pede mais o código', async () => {
    const client = await e2e.registerClientWithMfa();

    const response = await changeMfa(client, false);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mfaEnabled: false });
    const profile = await getProfile(await e2e.logIn(client));
    expect(profile.status).toBe(200);
    expect(codeMailsSentTo(client.email)).toBe(0);
  });
});
