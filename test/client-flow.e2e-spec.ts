import { Role } from '@modules/users/domain/value-objects/role';

import { buildClientPayload, E2eApp, readTokens, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

/** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
describe('Fluxo do Client (e2e)', () => {
  const payload = buildClientPayload();
  let e2e: E2eApp;
  let clientId: string;
  let session: Tokens;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    // Como em produção, o seed roda antes do primeiro cadastro: é ele que cria os papéis no
    // SuperTokens.
    await e2e.seedSuperAdmin();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('deve cadastrar o Client pelo app, sem devolver a senha', async () => {
    const response = await e2e.api().post('/api/clients').send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String) as string,
      role: Role.CLIENT,
      name: payload.name,
      email: payload.email,
      status: 'ACTIVE',
      cpf: payload.cpf,
      phone: '43999998888',
      birthDate: payload.birthDate,
      createdAt: expect.any(String) as string,
    });
    expect(response.text).not.toContain(payload.password);
    clientId = (response.body as { id: string }).id;
  });

  it('deve fazer login no modo header e receber os tokens nos headers', async () => {
    const response = await e2e.signIn(payload.email, payload.password);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'OK', user: { id: clientId } });
    expect(response.get('set-cookie')).toBeUndefined();
    session = readTokens(response);
    expect(session).toEqual({
      accessToken: expect.stringMatching(/.+/) as string,
      refreshToken: expect.stringMatching(/.+/) as string,
    });
  });

  it('deve retornar o perfil completo e o papel em /users/me', async () => {
    const response = await e2e.api().get('/api/users/me').auth(session.accessToken, BEARER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: clientId,
      role: Role.CLIENT,
      email: payload.email,
      status: 'ACTIVE',
      cpf: payload.cpf,
      lastLoginAt: expect.any(String) as string,
    });
  });

  it('deve renovar a sessão com o refresh token e aceitar o novo access token', async () => {
    const response = await e2e.refresh(session.refreshToken);

    expect(response.status).toBe(200);
    const renewed = readTokens(response);
    expect(renewed.accessToken).not.toBe(session.accessToken);
    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    session = renewed;
    const profile = await e2e.api().get('/api/users/me').auth(session.accessToken, BEARER);
    expect(profile.status).toBe(200);
  });

  it('deve encerrar a sessão no signout e recusar o refresh token dela', async () => {
    const response = await e2e.api().post('/api/auth/signout').auth(session.accessToken, BEARER);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'OK' });
    // A resposta manda o app descartar os tokens, e a sessão revogada não se renova mais.
    expect(response.headers).toMatchObject({
      'st-access-token': '',
      'st-refresh-token': '',
      'front-token': 'remove',
    });
    const refresh = await e2e.refresh(session.refreshToken);
    expect(refresh.status).toBe(401);
  });
});
