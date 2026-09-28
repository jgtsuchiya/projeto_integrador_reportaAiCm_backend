import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import UserRoles from 'supertokens-node/recipe/userroles';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { UserRepository } from '@modules/users/domain/repositories/user.repository';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role, ROLES } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import {
  UserOrmEntity,
  UserStatusColumn,
} from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { MailDeliveryError, MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';
const NEW_PASSWORD = 'senha-do-admin-2';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface InvitedAdmin {
  id: string;
  email: string;
  status: string;
  createdById: string;
  invitation: { sent: boolean; expiresAt: string };
}

describe('Convite de ADM por e-mail (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  const mailSender = new FakeMailSender();
  const emails: string[] = [];
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
    superAdmin = await createUser(Role.SUPER_ADMIN);
  });

  beforeEach(() => {
    mailSender.messages.length = 0;
  });

  afterAll(async () => {
    const users = await Promise.all(
      emails.map((email) => supertokens.listUsersByAccountInfo(TENANT_ID, { email })),
    );
    const ids = users.flat().map((user) => user.id);
    const repository = dataSource?.getRepository(UserOrmEntity);
    // Os ADMINs referenciam o SuperAdm (created_by_id), então saem primeiro. Os tokens saem
    // junto com o usuário (ON DELETE CASCADE).
    await repository?.delete({ email: In(emails), roleId: ROLE_IDS[Role.ADMIN] });
    await repository?.delete({ email: In(emails) });
    await Promise.all(ids.map((id) => supertokens.deleteUser(id)));
    await dataSource?.destroy();
    await app?.close();
  });

  function newEmail(prefix: string): string {
    const email = `${prefix}.${randomUUID()}@reportaai.invalid`;
    emails.push(email);

    return email;
  }

  /** Cria o usuário no SuperTokens e no MySQL (ACTIVE) e faz login no modo header. */
  async function createUser(role: Role, status: UserStatusColumn = 'ACTIVE'): Promise<TestUser> {
    const email = newEmail(role.toLowerCase());
    const id = await identityProvider.createCredentials(
      Email.create(email),
      Password.create(PASSWORD),
    );
    await dataSource.getRepository(UserOrmEntity).insert({
      id,
      roleId: ROLE_IDS[role],
      name: 'Usuário de teste',
      email,
      status,
    });

    return { id, email, accessToken: await signIn(email, PASSWORD) };
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

  async function signIn(email: string, password: string): Promise<string> {
    return (await signInRequest(email, password)).headers.get('st-access-token') ?? '';
  }

  function post(path: string, body?: unknown, accessToken?: string): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function invite(overrides: Record<string, unknown> = {}): Promise<InvitedAdmin> {
    const response = await post(
      '/admins',
      { name: 'Ana Souza', email: newEmail('admin'), ...overrides },
      superAdmin.accessToken,
    );

    if (response.status !== 201) {
      throw new Error(`Convite falhou: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as InvitedAdmin;
  }

  /** Segredo do link do último e-mail enviado. */
  function lastSecret(): string {
    const text = mailSender.messages.at(-1)?.text ?? '';
    const match = /\/convite\?token=([\w-]+)/.exec(text);

    if (!match) {
      throw new Error('Nenhum convite foi enviado.');
    }

    return match[1];
  }

  function accept(token: string, password = NEW_PASSWORD): Promise<Response> {
    return post('/invitations/accept', { token, password });
  }

  function findUser(id: string): Promise<UserOrmEntity> {
    return dataSource.getRepository(UserOrmEntity).findOneByOrFail({ id });
  }

  function findTokens(userId: string): Promise<UserTokenOrmEntity[]> {
    return dataSource.getRepository(UserTokenOrmEntity).findBy({ userId });
  }

  describe('POST /api/admins', () => {
    it('deve criar o ADMIN PENDING com quem convidou e responder 201', async () => {
      const email = newEmail('admin');

      const response = await post(
        '/admins',
        { name: '  Ana Souza  ', email: email.toUpperCase() },
        superAdmin.accessToken,
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as InvitedAdmin;
      expect(body).toEqual({
        id: expect.any(String) as string,
        role: Role.ADMIN,
        name: 'Ana Souza',
        email,
        status: 'PENDING',
        createdById: superAdmin.id,
        createdAt: expect.any(String) as string,
        invitation: { sent: true, expiresAt: expect.any(String) as string },
      });
      await expect(findUser(body.id)).resolves.toMatchObject({
        roleId: ROLE_IDS[Role.ADMIN],
        status: 'PENDING',
        emailVerifiedAt: null,
        createdById: superAdmin.id,
      });
      await expect(UserRoles.getRolesForUser(TENANT_ID, body.id)).resolves.toMatchObject({
        roles: [Role.ADMIN],
      });
    });

    it('deve enviar o link do convite e guardar só o hash do token (48 h)', async () => {
      const admin = await invite();

      const secret = lastSecret();
      const [token] = await findTokens(admin.id);
      expect(mailSender.messages).toHaveLength(1);
      expect(mailSender.messages[0].to).toBe(admin.email);
      expect(mailSender.messages[0].text).toContain(`${env.WEB_APP_URL}/convite?token=${secret}`);
      expect(token).toMatchObject({
        type: 'INVITATION',
        tokenHash: createHash('sha256').update(secret).digest('hex'),
        usedAt: null,
      });
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(
        env.INVITATION_EXPIRES_IN_HOURS * 60 * 60 * 1000,
      );
      expect(new Date(admin.invitation.expiresAt)).toEqual(token.expiresAt);
      const rows: unknown = await dataSource.query('SELECT * FROM user_tokens WHERE user_id = ?', [
        admin.id,
      ]);
      expect(JSON.stringify(rows)).not.toContain(secret);
    });

    it('não deve permitir o login do ADMIN PENDING', async () => {
      const admin = await invite();

      const response = await signInRequest(admin.email, PASSWORD);

      await expect(response.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
    });

    it.each([
      [Role.ADMIN, 403],
      [Role.CLIENT, 403],
    ])('deve responder %s → %p, sem criar o ADMIN (RN04)', async (role, status) => {
      const user = await createUser(role);
      const email = newEmail('admin');

      const response = await post('/admins', { name: 'Ana', email }, user.accessToken);

      expect(response.status).toBe(status);
      await expect(supertokens.listUsersByAccountInfo(TENANT_ID, { email })).resolves.toEqual([]);
      expect(mailSender.messages).toHaveLength(0);
    });

    it('deve responder 401 sem sessão', async () => {
      const response = await post('/admins', { name: 'Ana', email: newEmail('admin') });

      expect(response.status).toBe(401);
    });

    it('deve responder 409 para um e-mail já cadastrado (RN02)', async () => {
      const response = await post(
        '/admins',
        { name: 'Ana', email: superAdmin.email },
        superAdmin.accessToken,
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ message: 'E-mail já cadastrado.' });
    });

    it('deve responder 400 com os campos inválidos', async () => {
      const response = await post(
        '/admins',
        { name: ' ', email: 'invalido' },
        superAdmin.accessToken,
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        details: [
          { field: 'name', message: 'O nome é obrigatório.' },
          { field: 'email', message: 'E-mail inválido.' },
        ],
      });
    });

    it('deve manter o ADMIN PENDING quando o e-mail falha, e o reenvio deve funcionar', async () => {
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const admin = await invite();

      expect(admin.invitation.sent).toBe(false);
      await expect(findUser(admin.id)).resolves.toMatchObject({ status: 'PENDING' });
      const response = await post(
        `/admins/${admin.id}/invitation`,
        undefined,
        superAdmin.accessToken,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ sent: true });
      expect(mailSender.messages).toHaveLength(1);
    });

    it('não deve deixar credencial órfã no SuperTokens quando a gravação no MySQL falha', async () => {
      jest
        .spyOn(app.get(UserRepository), 'saveWithToken')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));
      const email = newEmail('admin');

      const response = await post('/admins', { name: 'Ana', email }, superAdmin.accessToken);

      expect(response.status).toBe(500);
      await expect(supertokens.listUsersByAccountInfo(TENANT_ID, { email })).resolves.toEqual([]);
      expect(mailSender.messages).toHaveLength(0);
    });
  });

  describe('POST /api/invitations/accept', () => {
    it('deve definir a senha e ativar o ADMIN, que passa a fazer login', async () => {
      const admin = await invite();

      const response = await accept(lastSecret());

      expect(response.status).toBe(204);
      const row = await findUser(admin.id);
      expect(row.status).toBe('ACTIVE');
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);
      const [token] = await findTokens(admin.id);
      expect(token.usedAt).toBeInstanceOf(Date);
      const signIn = await signInRequest(admin.email, NEW_PASSWORD);
      await expect(signIn.json()).resolves.toMatchObject({ status: 'OK' });
    });

    it('deve responder 422 para um token já usado', async () => {
      await invite();
      const secret = lastSecret();
      await accept(secret);

      const response = await accept(secret, 'outra-senha-3');

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Link inválido, expirado ou já utilizado.',
        details: { field: 'token' },
      });
    });

    it('deve responder 422 para um token expirado', async () => {
      const admin = await invite();
      await dataSource
        .getRepository(UserTokenOrmEntity)
        .update({ userId: admin.id }, { expiresAt: new Date(Date.now() - 1000) });

      const response = await accept(lastSecret());

      expect(response.status).toBe(422);
      await expect(findUser(admin.id)).resolves.toMatchObject({ status: 'PENDING' });
    });

    it('deve responder 422 para um token inexistente', async () => {
      const response = await accept('token-que-nao-existe');

      expect(response.status).toBe(422);
    });

    it('deve responder 400 para uma senha fora da política, sem usar o token (RN08)', async () => {
      const admin = await invite();

      const response = await accept(lastSecret(), 'somenteletras');

      expect(response.status).toBe(400);
      const [token] = await findTokens(admin.id);
      expect(token.usedAt).toBeNull();
    });

    it('deve permitir aceitar de novo quando a gravação no MySQL falha', async () => {
      const admin = await invite();
      const secret = lastSecret();
      jest
        .spyOn(app.get(UserRepository), 'saveWithToken')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));

      const failed = await accept(secret);

      expect(failed.status).toBe(500);
      await expect(findUser(admin.id)).resolves.toMatchObject({ status: 'PENDING' });
      await expect(accept(secret)).resolves.toHaveProperty('status', 204);
      await expect(findUser(admin.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });
  });

  describe('POST /api/admins/:id/invitation', () => {
    function resend(id: string, accessToken = superAdmin.accessToken): Promise<Response> {
      return post(`/admins/${id}/invitation`, undefined, accessToken);
    }

    it('deve enviar um convite novo e invalidar o anterior (RN06)', async () => {
      const admin = await invite();
      const oldSecret = lastSecret();

      const response = await resend(admin.id);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        sent: true,
        expiresAt: expect.any(String) as string,
      });
      const newSecret = lastSecret();
      expect(newSecret).not.toBe(oldSecret);
      await expect(findTokens(admin.id)).resolves.toHaveLength(1);
      await expect(accept(oldSecret)).resolves.toHaveProperty('status', 422);
      await expect(accept(newSecret)).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 422 para um ADMIN que já aceitou o convite', async () => {
      const admin = await invite();
      await accept(lastSecret());

      const response = await resend(admin.id);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        message: 'O convite só pode ser reenviado para um administrador pendente.',
      });
    });

    it('deve responder 404 para um id que não é de ADMIN', async () => {
      const client = await createUser(Role.CLIENT);

      await expect(resend(client.id)).resolves.toHaveProperty('status', 404);
      await expect(resend(superAdmin.id)).resolves.toHaveProperty('status', 404);
      await expect(resend(randomUUID())).resolves.toHaveProperty('status', 404);
    });

    it('deve responder 400 para um id que não é UUID', async () => {
      const response = await resend('nao-e-uuid');

      expect(response.status).toBe(400);
    });

    it('deve responder 403 para um ADMIN (RN04)', async () => {
      const pending = await invite();
      const admin = await createUser(Role.ADMIN);

      const response = await resend(pending.id, admin.accessToken);

      expect(response.status).toBe(403);
    });
  });
});
