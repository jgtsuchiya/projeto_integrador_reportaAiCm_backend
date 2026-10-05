import type request from 'supertest';

import { Actor, E2eApp, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

describe('Inativação de usuários (e2e)', () => {
  let e2e: E2eApp;
  let superAdmin: Actor;
  let admin: Actor;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    superAdmin = await e2e.seedSuperAdmin();
    admin = await e2e.createAdmin(superAdmin);
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function getProfile(session: Tokens): request.Test {
    return e2e.api().get('/api/users/me').auth(session.accessToken, BEARER);
  }

  function changeStatus(path: string, status: string, actor: Tokens): request.Test {
    return e2e.api().patch(`/api${path}/status`).auth(actor.accessToken, BEARER).send({ status });
  }

  it('deve tirar o acesso do Client inativado já na requisição seguinte', async () => {
    const client = await e2e.registerClient();
    const before = await getProfile(client);

    const response = await changeStatus(`/clients/${client.id}`, 'INACTIVE', admin);
    const after = await getProfile(client);

    expect(before.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: client.id, status: 'INACTIVE' });
    expect(after.status).toBe(401);
    // Também não renova a sessão nem entra de novo (RN09, RN10).
    const refresh = await e2e.refresh(client.refreshToken);
    expect(refresh.status).toBe(401);
    const signIn = await e2e.signIn(client.email, client.password);
    expect(signIn.body).toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
  });

  it('deve devolver o acesso ao Client reativado, com um novo login', async () => {
    const client = await e2e.registerClient();
    await changeStatus(`/clients/${client.id}`, 'INACTIVE', admin);

    const response = await changeStatus(`/clients/${client.id}`, 'ACTIVE', admin);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: client.id, status: 'ACTIVE' });
    // A inativação revogou a sessão antiga, que não se renova: o acesso volta por um novo login.
    const refresh = await e2e.refresh(client.refreshToken);
    expect(refresh.status).toBe(401);
    const profile = await getProfile(await e2e.logIn(client));
    expect(profile.status).toBe(200);
  });

  it('deve tirar o acesso do ADM inativado pelo SuperAdm já na requisição seguinte', async () => {
    const target = await e2e.createAdmin(superAdmin);
    const before = await getProfile(target);

    const response = await changeStatus(`/admins/${target.id}`, 'INACTIVE', superAdmin);
    const after = await getProfile(target);

    expect(before.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: target.id, status: 'INACTIVE' });
    expect(after.status).toBe(401);
    const signIn = await e2e.signIn(target.email, target.password);
    expect(signIn.body).toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
  });
});
