import { Role } from '@modules/users/domain/value-objects/role';

import { E2eApp, newEmail, PASSWORD, readTokens, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

/** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
describe('Fluxo do ADM (e2e)', () => {
  const superAdminAccount = { name: 'Super Admin', email: newEmail('super'), password: PASSWORD };
  const adminEmail = newEmail('admin');
  const adminPassword = 'senha-do-admin-2';
  let e2e: E2eApp;
  let superAdmin: Tokens;
  let adminId: string;
  let invitationToken: string;

  beforeAll(async () => {
    e2e = await E2eApp.start();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('deve cadastrar o SuperAdm pelo seed e fazer o login dele', async () => {
    const result = await e2e.runSeed(superAdminAccount);

    expect(result).toEqual({ created: true, userId: expect.any(String) as string });
    const response = await e2e.signIn(superAdminAccount.email, superAdminAccount.password);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'OK' });
    superAdmin = readTokens(response);
    const profile = await e2e.api().get('/api/users/me').auth(superAdmin.accessToken, BEARER);
    expect(profile.body).toMatchObject({ role: Role.SUPER_ADMIN, status: 'ACTIVE' });
  });

  it('deve convidar o ADM, que fica PENDING e recebe o link por e-mail', async () => {
    const response = await e2e
      .api()
      .post('/api/admins')
      .auth(superAdmin.accessToken, BEARER)
      .send({ name: 'Ana Souza', email: adminEmail });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      role: Role.ADMIN,
      email: adminEmail,
      status: 'PENDING',
      invitation: { sent: true },
    });
    adminId = (response.body as { id: string }).id;
    expect(e2e.mailSender.messages).toHaveLength(1);
    expect(e2e.mailSender.messages[0].to).toBe(adminEmail);
    invitationToken = e2e.lastInvitationToken();
  });

  it('deve aceitar o convite sem sessão, definindo a senha', async () => {
    const response = await e2e
      .api()
      .post('/api/invitations/accept')
      .send({ token: invitationToken, password: adminPassword });

    expect(response.status).toBe(204);
  });

  it('deve fazer login como ADM ACTIVE com a senha definida no aceite', async () => {
    const response = await e2e.signIn(adminEmail, adminPassword);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'OK', user: { id: adminId } });
    const { accessToken } = readTokens(response);
    const profile = await e2e.api().get('/api/users/me').auth(accessToken, BEARER);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({
      id: adminId,
      role: Role.ADMIN,
      status: 'ACTIVE',
      emailVerifiedAt: expect.any(String) as string,
    });
  });
});
