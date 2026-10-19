import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { LOGIN_CODE_MAIL_SUBJECT } from '@modules/users/application/services/login-code.service';
import { PASSWORD_CHANGED_MAIL_SUBJECT } from '@modules/users/application/services/password-changed-notice';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role, ROLES } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { MailDeliveryError, MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { deleteLoginAttempts } from './support/login-attempts';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';
const NEW_PASSWORD = 'senha-nova-2';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface TestUser extends Tokens {
  id: string;
  email: string;
}

interface TestClient extends TestUser {
  /** Só dígitos. */
  cpf: string;
}

/** Gera um CPF válido, para cada teste ter o seu. */
function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (const length of [9, 10]) {
    const sum = digits.reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    digits.push(((sum * 10) % 11) % 10);
  }

  return digits.join('');
}

describe('Perfil do usuário autenticado (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  const mailSender = new FakeMailSender();
  const emails: string[] = [];
  const createdIds: string[] = [];
  let dataSource: DataSource;
  let app: INestApplication;
  let baseUrl: string;
  let superAdmin: TestUser;

  beforeAll(async () => {
    // Proteção: o teste grava no banco; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    dataSource = new DataSource({
      ...buildDataSourceOptions(env),
      entities: [RoleOrmEntity, UserOrmEntity, ClientProfileOrmEntity, UserTokenOrmEntity],
      migrations: [
        join(__dirname, '..', 'src', 'shared', 'infra', 'database', 'migrations', '*.ts'),
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(mailSender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    // Em produção, os papéis são criados no SuperTokens pelo seed.
    await identityProvider.createRoles(ROLES);
    superAdmin = await createStaff(Role.SUPER_ADMIN);
  });

  afterAll(async () => {
    const users = await Promise.all(
      emails.map((email) => supertokens.listUsersByAccountInfo(TENANT_ID, { email })),
    );
    const ids = [...new Set([...createdIds, ...users.flat().map((user) => user.id)])];
    const repository = dataSource?.getRepository(UserOrmEntity);
    // Os ADMINs referenciam o SuperAdm (created_by_id), então saem primeiro. O perfil do
    // Client sai junto (ON DELETE CASCADE).
    await repository?.delete({ id: In(ids), roleId: ROLE_IDS[Role.ADMIN] });
    await repository?.delete({ id: In(ids) });
    await Promise.all(ids.map((id) => supertokens.deleteUser(id)));
    await deleteLoginAttempts(dataSource, emails);
    await dataSource?.destroy();
    await app?.close();
  });

  function newEmail(prefix: string): string {
    const email = `${prefix}.${randomUUID()}@reportaai.invalid`;
    emails.push(email);

    return email;
  }

  /**
   * Cria o SUPER_ADMIN ou o ADMIN direto no SuperTokens e no MySQL, e faz login. Os dois têm o
   * e-mail verificado, como pelo seed e pelo aceite do convite.
   */
  async function createStaff(role: Role): Promise<TestUser> {
    const email = newEmail(role.toLowerCase());
    const id = await identityProvider.createCredentials(
      Email.create(email),
      Password.create(PASSWORD),
    );
    await identityProvider.assignRole(id, role);
    createdIds.push(id);
    await dataSource.getRepository(UserOrmEntity).insert({
      id,
      roleId: ROLE_IDS[role],
      name: 'Usuário de teste',
      email,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      createdById: role === Role.ADMIN ? superAdmin.id : null,
    });

    return { id, email, ...(await signIn(email, PASSWORD)) };
  }

  function registerClient(email: string, cpf: string): Promise<Response> {
    return fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Maria da Silva',
        email,
        password: PASSWORD,
        cpf,
        phone: '(43) 99999-8888',
        birthDate: '1990-05-20',
      }),
    });
  }

  /** Cadastra o Client pela rota do app e faz login. */
  async function createClient(): Promise<TestClient> {
    const email = newEmail('client');
    const cpf = randomCpf();
    const response = await registerClient(email, cpf);

    if (response.status !== 201) {
      throw new Error(`Cadastro falhou: ${response.status} ${await response.text()}`);
    }

    const { id } = (await response.json()) as { id: string };
    createdIds.push(id);

    return { id, email, cpf, ...(await signIn(email, PASSWORD)) };
  }

  function signInRequest(email: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        rid: 'emailpassword',
        'st-auth-mode': 'header',
      },
      body: JSON.stringify({
        formFields: [
          { id: 'email', value: email },
          { id: 'password', value: password },
        ],
      }),
    });
  }

  async function signIn(email: string, password: string): Promise<Tokens> {
    const response = await signInRequest(email, password);

    return {
      accessToken: response.headers.get('st-access-token') ?? '',
      refreshToken: response.headers.get('st-refresh-token') ?? '',
    };
  }

  function refresh(refreshToken: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshToken}`, 'st-auth-mode': 'header' },
    });
  }

  function request(
    method: string,
    path: string,
    { body, accessToken }: { body?: unknown; accessToken: string },
  ): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  function findRow(id: string): Promise<UserOrmEntity | null> {
    return dataSource.getRepository(UserOrmEntity).findOne({ where: { id }, withDeleted: true });
  }

  describe('GET /api/users/me', () => {
    it('deve retornar o CLIENT com o papel e o perfil completo, com o CPF sem máscara', async () => {
      const client = await createClient();

      const response = await request('GET', '/users/me', client);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        id: client.id,
        role: Role.CLIENT,
        name: 'Maria da Silva',
        email: client.email,
        status: 'ACTIVE',
        emailVerifiedAt: null,
        mfaEnabled: false,
        lastLoginAt: expect.any(String) as string,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
        cpf: client.cpf,
        phone: '43999998888',
        birthDate: '1990-05-20',
      });
    });

    it.each([Role.ADMIN, Role.SUPER_ADMIN])(
      'deve retornar o %s com o papel e sem os campos do CLIENT',
      async (role) => {
        const user = role === Role.SUPER_ADMIN ? superAdmin : await createStaff(role);

        const response = await request('GET', '/users/me', user);

        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body).toMatchObject({ id: user.id, role, email: user.email });
        expect(body).not.toHaveProperty('cpf');
        expect(body).not.toHaveProperty('phone');
        expect(body).not.toHaveProperty('birthDate');
      },
    );

    it('deve responder 401 sem sessão', async () => {
      await expect(request('GET', '/users/me', { accessToken: '' })).resolves.toHaveProperty(
        'status',
        401,
      );
    });
  });

  describe('PATCH /api/users/me', () => {
    it('deve editar o nome, o telefone e a data de nascimento do CLIENT, sem mudar e-mail e CPF', async () => {
      const client = await createClient();

      const response = await request('PATCH', '/users/me', {
        ...client,
        body: {
          name: 'Maria Souza',
          phone: '(43) 3222-1111',
          birthDate: '1991-06-21',
          email: 'outro@reportaai.invalid',
          cpf: randomCpf(),
        },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        name: 'Maria Souza',
        phone: '4332221111',
        birthDate: '1991-06-21',
        email: client.email,
        cpf: client.cpf,
      });
      await expect(findRow(client.id)).resolves.toMatchObject({
        name: 'Maria Souza',
        email: client.email,
      });
      await expect(
        dataSource.getRepository(ClientProfileOrmEntity).findOneBy({ userId: client.id }),
      ).resolves.toMatchObject({ cpf: client.cpf, phone: '4332221111', birthDate: '1991-06-21' });
    });

    it('deve editar o nome de um ADMIN', async () => {
      const admin = await createStaff(Role.ADMIN);

      const response = await request('PATCH', '/users/me', {
        ...admin,
        body: { name: 'Ana Lima' },
      });

      expect(response.status).toBe(200);
      await expect(findRow(admin.id)).resolves.toMatchObject({ name: 'Ana Lima' });
    });

    it('deve responder 422 quando um ADMIN envia telefone ou data de nascimento', async () => {
      const admin = await createStaff(Role.ADMIN);

      const response = await request('PATCH', '/users/me', {
        ...admin,
        body: { name: 'Ana Lima', phone: '43999998888' },
      });

      expect(response.status).toBe(422);
      await expect(findRow(admin.id)).resolves.toMatchObject({ name: 'Usuário de teste' });
    });

    it('deve responder 400 com os campos inválidos ou sem nenhum campo', async () => {
      const client = await createClient();

      const invalid = await request('PATCH', '/users/me', {
        ...client,
        body: { phone: '123', birthDate: '2999-01-01' },
      });
      const empty = await request('PATCH', '/users/me', { ...client, body: {} });

      expect(invalid.status).toBe(400);
      const body = (await invalid.json()) as { details: Array<{ field: string }> };
      expect(body.details.map(({ field }) => field)).toEqual(['phone', 'birthDate']);
      expect(empty.status).toBe(400);
    });
  });

  describe('PATCH /api/users/me/password', () => {
    function changePassword(user: Tokens, body: Record<string, unknown>): Promise<Response> {
      return request('PATCH', '/users/me/password', { ...user, body });
    }

    /** Assuntos dos e-mails enviados ao endereço. */
    function subjectsSentTo(email: string): string[] {
      return mailSender.messages.filter(({ to }) => to === email).map(({ subject }) => subject);
    }

    it('deve trocar a senha e revogar as outras sessões, mantendo a atual (RN13)', async () => {
      const client = await createClient();
      const other = await signIn(client.email, PASSWORD);
      await expect(Session.getAllSessionHandlesForUser(client.id)).resolves.toHaveLength(2);

      const response = await changePassword(client, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(response.status).toBe(204);
      await expect(Session.getAllSessionHandlesForUser(client.id)).resolves.toHaveLength(1);
      await expect(request('GET', '/users/me', client)).resolves.toHaveProperty('status', 200);
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 401);
      await expect(refresh(client.refreshToken)).resolves.toHaveProperty('status', 200);

      const oldSignIn = await signInRequest(client.email, PASSWORD);
      await expect(oldSignIn.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
      const newSignIn = await signInRequest(client.email, NEW_PASSWORD);
      await expect(newSignIn.json()).resolves.toMatchObject({ status: 'OK' });
    });

    it('deve avisar o usuário da troca por e-mail (RN21)', async () => {
      const admin = await createStaff(Role.ADMIN);

      const response = await changePassword(admin, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(response.status).toBe(204);
      expect(subjectsSentTo(admin.email)).toEqual([PASSWORD_CHANGED_MAIL_SUBJECT]);
    });

    it('deve trocar a senha mesmo quando o e-mail de aviso falha', async () => {
      const client = await createClient();
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const response = await changePassword(client, {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(response.status).toBe(204);
      const signIn = await signInRequest(client.email, NEW_PASSWORD);
      await expect(signIn.json()).resolves.toMatchObject({ status: 'OK' });
    });

    it('deve responder 401 e manter a senha quando a senha atual está incorreta', async () => {
      const admin = await createStaff(Role.ADMIN);

      const response = await changePassword(admin, {
        currentPassword: 'senha-errada-1',
        newPassword: NEW_PASSWORD,
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        message: 'Senha incorreta.',
        details: { field: 'currentPassword' },
      });
      const signIn = await signInRequest(admin.email, PASSWORD);
      await expect(signIn.json()).resolves.toMatchObject({ status: 'OK' });
      expect(subjectsSentTo(admin.email)).toEqual([]);
    });

    it('deve responder 400 para uma nova senha fora da política (RN08)', async () => {
      const client = await createClient();

      const response = await changePassword(client, {
        currentPassword: PASSWORD,
        newPassword: 'semnumero',
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { details: Array<{ field: string }> };
      expect(body.details.map(({ field }) => field)).toEqual(['newPassword']);
    });
  });

  describe('PATCH /api/users/me/mfa', () => {
    function changeMfa(user: Tokens, body: Record<string, unknown>): Promise<Response> {
      return request('PATCH', '/users/me/mfa', { ...user, body });
    }

    /** Quantos e-mails com o código da segunda etapa foram enviados ao endereço. */
    function countCodeMails(email: string): number {
      return mailSender.messages.filter(
        ({ to, subject }) => to === email && subject === LOGIN_CODE_MAIL_SUBJECT,
      ).length;
    }

    it('deve ativar com a senha, manter a sessão atual completa e revogar as outras (RN24)', async () => {
      const admin = await createStaff(Role.ADMIN);
      const other = await signIn(admin.email, PASSWORD);

      const response = await changeMfa(admin, { enabled: true, password: PASSWORD });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ id: admin.id, mfaEnabled: true });
      await expect(findRow(admin.id)).resolves.toMatchObject({ mfaEnabled: true });
      await expect(Session.getAllSessionHandlesForUser(admin.id)).resolves.toHaveLength(1);
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 401);

      // A sessão que ativou não pede o código, nem depois de renovada.
      await expect(request('GET', '/users/me', admin)).resolves.toHaveProperty('status', 200);
      const renewed = await refresh(admin.refreshToken);
      expect(renewed.status).toBe(200);
      const accessToken = renewed.headers.get('st-access-token') ?? '';
      await expect(request('GET', '/users/me', { accessToken })).resolves.toHaveProperty(
        'status',
        200,
      );
      expect(countCodeMails(admin.email)).toBe(0);
    });

    it('deve pedir o código no próximo login depois de ativar, e não pedir mais depois de desativar', async () => {
      const admin = await createStaff(Role.ADMIN);
      await changeMfa(admin, { enabled: true, password: PASSWORD });

      const pending = await signIn(admin.email, PASSWORD);

      expect(countCodeMails(admin.email)).toBe(1);
      const blocked = await request('GET', '/users/me', pending);
      expect(blocked.status).toBe(403);
      await expect(blocked.json()).resolves.toMatchObject({ message: 'invalid claim' });

      const disabled = await changeMfa(admin, { enabled: false, password: PASSWORD });
      const completed = await signIn(admin.email, PASSWORD);

      expect(disabled.status).toBe(200);
      await expect(disabled.json()).resolves.toMatchObject({ mfaEnabled: false });
      await expect(findRow(admin.id)).resolves.toMatchObject({ mfaEnabled: false });
      await expect(request('GET', '/users/me', completed)).resolves.toHaveProperty('status', 200);
      expect(countCodeMails(admin.email)).toBe(1);
    });

    it('deve responder 422 ao Client com o e-mail não verificado, sem ativar nem revogar sessões', async () => {
      const client = await createClient();
      const other = await signIn(client.email, PASSWORD);

      const response = await changeMfa(client, { enabled: true, password: PASSWORD });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        message: 'Verifique o seu e-mail antes de ativar a verificação em duas etapas.',
      });
      await expect(findRow(client.id)).resolves.toMatchObject({
        mfaEnabled: false,
        emailVerifiedAt: null,
      });
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve ativar para o Client com o e-mail verificado, respondendo o perfil completo', async () => {
      const client = await createClient();
      await dataSource
        .getRepository(UserOrmEntity)
        .update({ id: client.id }, { emailVerifiedAt: new Date() });

      const response = await changeMfa(client, { enabled: true, password: PASSWORD });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: client.id,
        mfaEnabled: true,
        cpf: client.cpf,
      });
    });

    it('deve responder 401 e não mudar nada quando a senha está incorreta', async () => {
      const admin = await createStaff(Role.ADMIN);
      const other = await signIn(admin.email, PASSWORD);

      const response = await changeMfa(admin, { enabled: true, password: 'senha-errada-1' });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        message: 'Senha incorreta.',
        details: { field: 'password' },
      });
      await expect(findRow(admin.id)).resolves.toMatchObject({ mfaEnabled: false });
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve responder 200 sem efeito ao desativar o que já está desativado', async () => {
      const admin = await createStaff(Role.ADMIN);
      const before = await findRow(admin.id);

      const response = await changeMfa(admin, { enabled: false, password: PASSWORD });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ mfaEnabled: false });
      await expect(findRow(admin.id)).resolves.toMatchObject({
        mfaEnabled: false,
        updatedAt: before?.updatedAt,
      });
    });

    it('deve responder 200 sem efeito ao ativar o que já está ativo, sem revogar as sessões', async () => {
      const admin = await createStaff(Role.ADMIN);
      await changeMfa(admin, { enabled: true, password: PASSWORD });
      const before = await findRow(admin.id);
      const other = await signIn(admin.email, PASSWORD);

      const response = await changeMfa(admin, { enabled: true, password: PASSWORD });

      expect(response.status).toBe(200);
      await expect(findRow(admin.id)).resolves.toMatchObject({
        mfaEnabled: true,
        updatedAt: before?.updatedAt,
      });
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve responder 400 sem o enabled booleano ou sem a senha', async () => {
      const admin = await createStaff(Role.ADMIN);

      const response = await changeMfa(admin, { enabled: 'sim' });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { details: Array<{ field: string }> };
      expect(body.details.map(({ field }) => field)).toEqual(['enabled', 'password']);
    });
  });

  describe('DELETE /api/users/me', () => {
    function deleteAccount(user: Tokens, password: string): Promise<Response> {
      return request('DELETE', '/users/me', { ...user, body: { password } });
    }

    it('deve excluir e anonimizar o CLIENT, liberando o e-mail e o CPF (RN11, RN15)', async () => {
      const client = await createClient();

      const response = await deleteAccount(client, PASSWORD);

      expect(response.status).toBe(204);
      await expect(findRow(client.id)).resolves.toMatchObject({
        name: 'Usuário excluído',
        email: `deleted+${client.id}@reportaai.invalid`,
        deletedAt: expect.any(Date) as Date,
      });
      await expect(
        dataSource.getRepository(ClientProfileOrmEntity).existsBy({ userId: client.id }),
      ).resolves.toBe(false);
      await expect(supertokens.getUser(client.id)).resolves.toBeUndefined();

      // A sessão da exclusão não vale mais, e o login falha.
      await expect(request('GET', '/users/me', client)).resolves.toHaveProperty('status', 401);
      const signIn = await signInRequest(client.email, PASSWORD);
      await expect(signIn.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });

      // O mesmo e-mail e o mesmo CPF podem ser cadastrados de novo.
      const again = await registerClient(client.email, client.cpf);
      expect(again.status).toBe(201);
      createdIds.push(((await again.json()) as { id: string }).id);
    });

    it('deve responder 401 e manter a conta quando a senha está incorreta', async () => {
      const client = await createClient();

      const response = await deleteAccount(client, 'senha-errada-1');

      expect(response.status).toBe(401);
      await expect(findRow(client.id)).resolves.toMatchObject({
        email: client.email,
        deletedAt: null,
      });
    });

    it('deve responder 400 sem a senha', async () => {
      const client = await createClient();

      await expect(request('DELETE', '/users/me', { ...client, body: {} })).resolves.toHaveProperty(
        'status',
        400,
      );
    });

    it.each([Role.ADMIN, Role.SUPER_ADMIN])(
      'deve responder 403 para um %s, que não se autoexclui (RN15)',
      async (role) => {
        const user = role === Role.SUPER_ADMIN ? superAdmin : await createStaff(role);

        const response = await deleteAccount(user, PASSWORD);

        expect(response.status).toBe(403);
        await expect(findRow(user.id)).resolves.toMatchObject({ deletedAt: null });
      },
    );
  });
});
