import type request from 'supertest';

import { Account, buildClientPayload, E2eApp, readTokens, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;
const PHONE = 'ReportaAi/1.0 (Android 15)';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

interface Session {
  id: string;
  current: boolean;
}

describe('Sessões ativas (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function listSessions(session: Tokens): request.Test {
    return e2e.api().get('/api/users/me/sessions').auth(session.accessToken, BEARER);
  }

  function revokeSession(session: Tokens, id: string): request.Test {
    return e2e.api().delete(`/api/users/me/sessions/${id}`).auth(session.accessToken, BEARER);
  }

  /** Cadastra um Client sem fazer login, para o teste controlar as sessões que ele abre. */
  async function registerClient(): Promise<Account> {
    const payload = buildClientPayload();
    const response = await e2e.api().post('/api/clients').send(payload);

    if (response.status !== 201) {
      throw new Error(`Cadastro do Client falhou: ${response.status} ${response.text}`);
    }

    return {
      id: (response.body as { id: string }).id,
      email: payload.email,
      password: payload.password,
    };
  }

  /** Login com o user agent do aparelho, que aparece na listagem das sessões. */
  async function logInFrom(account: Account, userAgent: string): Promise<Tokens> {
    return readTokens(
      await e2e.signIn(account.email, account.password).set('user-agent', userAgent),
    );
  }

  /** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
  describe('Encerrar a sessão de outro aparelho', () => {
    let phone: Tokens;
    let browser: Tokens;
    let browserSessionId: string;

    beforeAll(async () => {
      const client = await registerClient();
      phone = await logInFrom(client, PHONE);
      browser = await logInFrom(client, BROWSER);
    });

    it('deve listar as duas sessões, com a origem do login e a atual marcada', async () => {
      const response = await listSessions(phone);

      expect(response.status).toBe(200);
      const sessions = response.body as Session[];
      expect(sessions).toHaveLength(2);
      expect(sessions).toEqual(
        expect.arrayContaining([
          {
            id: expect.any(String) as string,
            createdAt: expect.any(String) as string,
            expiresAt: expect.any(String) as string,
            ipAddress: '127.0.0.1',
            userAgent: PHONE,
            current: true,
          },
          expect.objectContaining({ userAgent: BROWSER, current: false }),
        ]),
      );
      browserSessionId = sessions.find((session) => !session.current)?.id ?? '';
    });

    it('deve encerrar a outra sessão, que não renova mais', async () => {
      const response = await revokeSession(phone, browserSessionId);

      expect(response.status).toBe(204);
      const refresh = await e2e.refresh(browser.refreshToken);
      expect(refresh.status).toBe(401);
    });

    it('deve manter a sessão atual, a única que sobra na listagem', async () => {
      const response = await listSessions(phone);

      expect(response.body).toEqual([expect.objectContaining({ userAgent: PHONE, current: true })]);
      const refresh = await e2e.refresh(phone.refreshToken);
      expect(refresh.status).toBe(200);
    });
  });

  it('deve encerrar todas as outras sessões de uma vez, menos a atual', async () => {
    const client = await registerClient();
    const current = await logInFrom(client, PHONE);
    const others = [await logInFrom(client, BROWSER), await e2e.logIn(client)];

    const response = await e2e
      .api()
      .delete('/api/users/me/sessions')
      .auth(current.accessToken, BEARER);

    expect(response.status).toBe(204);
    const refreshes = await Promise.all(
      others.map(({ refreshToken }) => e2e.refresh(refreshToken)),
    );
    expect(refreshes.map(({ status }) => status)).toEqual([401, 401]);
    const sessions = await listSessions(current);
    expect(sessions.body).toEqual([expect.objectContaining({ current: true })]);
  });

  it('deve responder 404 à sessão de outro usuário, sem encerrá-la (RN23)', async () => {
    const owner = await e2e.registerClient();
    const ownerSessionId = await e2e.currentSessionId(owner);
    const other = await e2e.registerClient();

    const response = await revokeSession(other, ownerSessionId);

    expect(response.status).toBe(404);
    const refresh = await e2e.refresh(owner.refreshToken);
    expect(refresh.status).toBe(200);
  });
});
