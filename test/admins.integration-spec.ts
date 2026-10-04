import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
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
import { MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface AdminBody {
  id: string;
  role: string;
  name: string;
  email: string;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: AdminBody[];
  page: number;
  pageSize: number;
  total: number;
}

describe('Gestão de ADMs pelo SuperAdm (integração)', () => {
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
    superAdmin = await createUser(Role.SUPER_ADMIN);
  });

  beforeEach(() => {
    mailSender.messages.length = 0;
  });

  afterAll(async () => {
    const users = await Promise.all(
      emails.map((email) => supertokens.listUsersByAccountInfo(TENANT_ID, { email })),
    );
    const ids = [...new Set([...createdIds, ...users.flat().map((user) => user.id)])];
    const repository = dataSource?.getRepository(UserOrmEntity);
    // Os ADMINs referenciam o SuperAdm (created_by_id), então saem primeiro. Os excluídos
    // (e-mail anonimizado) são encontrados pelo id. Os tokens saem junto (ON DELETE CASCADE).
    await repository?.delete({ id: In(ids), roleId: ROLE_IDS[Role.ADMIN] });
    await repository?.delete({ id: In(ids) });
    await Promise.all(ids.map((id) => supertokens.deleteUser(id)));
    await dataSource?.destroy();
    await app?.close();
  });

  function newEmail(prefix: string): string {
    const email = `${prefix}.${randomUUID()}@reportaai.invalid`;
    emails.push(email);

    return email;
  }

  /** Cria o usuário no SuperTokens e no MySQL e faz login no modo header (se ACTIVE). */
  async function createUser(role: Role, status: UserStatusColumn = 'ACTIVE'): Promise<TestUser> {
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
      status,
      createdById: role === Role.ADMIN ? superAdmin.id : null,
    });

    return { id, email, accessToken: status === 'ACTIVE' ? await signIn(email, PASSWORD) : '' };
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

  function request(
    method: string,
    path: string,
    { body, accessToken = superAdmin.accessToken }: { body?: unknown; accessToken?: string } = {},
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

  async function invite(email = newEmail('admin')): Promise<AdminBody> {
    const response = await request('POST', '/admins', { body: { name: 'Ana Souza', email } });

    if (response.status !== 201) {
      throw new Error(`Convite falhou: ${response.status} ${await response.text()}`);
    }

    const admin = (await response.json()) as AdminBody;
    createdIds.push(admin.id);

    return admin;
  }

  /** Segredo do link do último e-mail enviado. */
  function lastSecret(): string {
    const match = /\/convite\?token=([\w-]+)/.exec(mailSender.messages.at(-1)?.text ?? '');

    if (!match) {
      throw new Error('Nenhum convite foi enviado.');
    }

    return match[1];
  }

  function findRow(id: string): Promise<UserOrmEntity | null> {
    return dataSource.getRepository(UserOrmEntity).findOne({ where: { id }, withDeleted: true });
  }

  describe('GET /api/admins', () => {
    it('deve listar os ADMINs paginados, sem outros papéis', async () => {
      const admin = await invite();
      await createUser(Role.CLIENT);

      const response = await request('GET', '/admins?pageSize=100');

      expect(response.status).toBe(200);
      const body = (await response.json()) as PageBody;
      expect(body).toMatchObject({ page: 1, pageSize: 100 });
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.items.every((item) => item.role === Role.ADMIN)).toBe(true);
      expect(body.items.find((item) => item.id === admin.id)).toEqual({
        id: admin.id,
        role: Role.ADMIN,
        name: 'Ana Souza',
        email: admin.email,
        status: 'PENDING',
        emailVerifiedAt: null,
        lastLoginAt: null,
        createdById: superAdmin.id,
        createdAt: admin.createdAt,
        updatedAt: expect.any(String) as string,
      });
    });

    it('deve filtrar pelo status', async () => {
      const inactive = await createUser(Role.ADMIN, 'INACTIVE');

      const response = await request('GET', '/admins?status=INACTIVE&pageSize=100');

      const body = (await response.json()) as PageBody;
      expect(body.items.map(({ id }) => id)).toContain(inactive.id);
      expect(body.items.every((item) => item.status === 'INACTIVE')).toBe(true);
    });

    it('deve responder 400 para uma query inválida', async () => {
      const response = await request('GET', '/admins?pageSize=101&status=DELETED');

      expect(response.status).toBe(400);
      const body = (await response.json()) as { details: Array<{ field: string }> };
      expect(body.details.map(({ field }) => field)).toEqual(['pageSize', 'status']);
    });

    it.each([Role.ADMIN, Role.CLIENT])('deve responder 403 para um %s (RN04)', async (role) => {
      const user = await createUser(role);

      await expect(
        request('GET', '/admins', { accessToken: user.accessToken }),
      ).resolves.toHaveProperty('status', 403);
    });

    it('deve responder 401 sem sessão', async () => {
      await expect(request('GET', '/admins', { accessToken: '' })).resolves.toHaveProperty(
        'status',
        401,
      );
    });
  });

  describe('GET /api/admins/:id', () => {
    it('deve retornar o ADMIN', async () => {
      const admin = await invite();

      const response = await request('GET', `/admins/${admin.id}`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: admin.id,
        email: admin.email,
        status: 'PENDING',
      });
    });

    it('deve responder 404 para os ids de SUPER_ADMIN, CLIENT ou inexistente', async () => {
      const client = await createUser(Role.CLIENT);

      for (const id of [superAdmin.id, client.id, randomUUID()]) {
        await expect(request('GET', `/admins/${id}`)).resolves.toHaveProperty('status', 404);
      }
    });

    it('deve responder 400 para um id que não é UUID', async () => {
      await expect(request('GET', '/admins/nao-e-uuid')).resolves.toHaveProperty('status', 400);
    });
  });

  describe('PATCH /api/admins/:id', () => {
    it('deve editar o nome do ADMIN', async () => {
      const admin = await invite();

      const response = await request('PATCH', `/admins/${admin.id}`, {
        body: { name: '  Ana Lima  ', email: 'outro@reportaai.invalid' },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        name: 'Ana Lima',
        email: admin.email,
      });
      await expect(findRow(admin.id)).resolves.toMatchObject({
        name: 'Ana Lima',
        email: admin.email,
      });
    });

    it('deve responder 400 para um nome inválido', async () => {
      const admin = await invite();

      const response = await request('PATCH', `/admins/${admin.id}`, { body: { name: ' ' } });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        details: [{ field: 'name', message: 'O nome é obrigatório.' }],
      });
    });

    it('deve responder 404 para o id de um SUPER_ADMIN (RN03)', async () => {
      const response = await request('PATCH', `/admins/${superAdmin.id}`, {
        body: { name: 'Outro nome' },
      });

      expect(response.status).toBe(404);
      await expect(findRow(superAdmin.id)).resolves.toMatchObject({ name: 'Usuário de teste' });
    });

    it('deve responder 403 para um ADMIN (RN04)', async () => {
      const target = await invite();
      const admin = await createUser(Role.ADMIN);

      const response = await request('PATCH', `/admins/${target.id}`, {
        body: { name: 'Outro nome' },
        accessToken: admin.accessToken,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/admins/:id/status', () => {
    function changeStatus(id: string, status: string, accessToken?: string): Promise<Response> {
      return request('PATCH', `/admins/${id}/status`, { body: { status }, accessToken });
    }

    it('deve inativar o ADMIN, que perde o acesso na requisição seguinte (RN10)', async () => {
      const admin = await createUser(Role.ADMIN);
      // Com sessão válida, o ADMIN chega à rota e recebe 403 pelo papel.
      await expect(
        request('GET', '/admins', { accessToken: admin.accessToken }),
      ).resolves.toHaveProperty('status', 403);

      const response = await changeStatus(admin.id, 'INACTIVE');

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ id: admin.id, status: 'INACTIVE' });
      await expect(Session.getAllSessionHandlesForUser(admin.id)).resolves.toEqual([]);
      await expect(
        request('GET', '/admins', { accessToken: admin.accessToken }),
      ).resolves.toHaveProperty('status', 401);
      const signIn = await signInRequest(admin.email, PASSWORD);
      await expect(signIn.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
    });

    it('deve reativar o ADMIN, que volta a fazer login', async () => {
      const admin = await createUser(Role.ADMIN, 'INACTIVE');

      const response = await changeStatus(admin.id, 'ACTIVE');

      expect(response.status).toBe(200);
      await expect(findRow(admin.id)).resolves.toMatchObject({ status: 'ACTIVE' });
      const signIn = await signInRequest(admin.email, PASSWORD);
      await expect(signIn.json()).resolves.toMatchObject({ status: 'OK' });
    });

    it.each(['ACTIVE', 'INACTIVE'])(
      'deve responder 422 ao mudar um ADMIN PENDING para %s',
      async (status) => {
        const admin = await invite();

        const response = await changeStatus(admin.id, status);

        expect(response.status).toBe(422);
        await expect(findRow(admin.id)).resolves.toMatchObject({ status: 'PENDING' });
      },
    );

    it('deve responder 400 para um status que não é ACTIVE nem INACTIVE', async () => {
      const admin = await createUser(Role.ADMIN);

      await expect(changeStatus(admin.id, 'PENDING')).resolves.toHaveProperty('status', 400);
    });

    it('deve responder 404 para os ids de SUPER_ADMIN e CLIENT', async () => {
      const client = await createUser(Role.CLIENT);

      await expect(changeStatus(superAdmin.id, 'INACTIVE')).resolves.toHaveProperty('status', 404);
      await expect(changeStatus(client.id, 'INACTIVE')).resolves.toHaveProperty('status', 404);
      await expect(findRow(client.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('deve responder 403 para um ADMIN (RN04)', async () => {
      const target = await createUser(Role.ADMIN);
      const admin = await createUser(Role.ADMIN);

      const response = await changeStatus(target.id, 'INACTIVE', admin.accessToken);

      expect(response.status).toBe(403);
      await expect(findRow(target.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });
  });

  describe('DELETE /api/admins/:id', () => {
    it('deve excluir o ADMIN, anonimizar o e-mail e removê-lo do SuperTokens (RN11)', async () => {
      const admin = await createUser(Role.ADMIN);

      const response = await request('DELETE', `/admins/${admin.id}`);

      expect(response.status).toBe(204);
      const row = await findRow(admin.id);
      expect(row).toMatchObject({
        name: 'Usuário de teste',
        email: `deleted+${admin.id}@reportaai.invalid`,
      });
      expect(row?.deletedAt).toBeInstanceOf(Date);
      await expect(supertokens.getUser(admin.id)).resolves.toBeUndefined();
      await expect(
        request('GET', '/admins', { accessToken: admin.accessToken }),
      ).resolves.toHaveProperty('status', 401);
      await expect(request('GET', `/admins/${admin.id}`)).resolves.toHaveProperty('status', 404);
    });

    it('deve cancelar o convite pendente', async () => {
      const admin = await invite();
      const secret = lastSecret();

      await request('DELETE', `/admins/${admin.id}`);

      await expect(
        dataSource.getRepository(UserTokenOrmEntity).findBy({ userId: admin.id }),
      ).resolves.toEqual([]);
      const accept = await request('POST', '/invitations/accept', {
        body: { token: secret, password: 'senha-do-admin-2' },
        accessToken: '',
      });
      expect(accept.status).toBe(422);
    });

    it('deve liberar o e-mail para um novo convite', async () => {
      const email = newEmail('admin');
      const first = await invite(email);
      await request('DELETE', `/admins/${first.id}`);

      const second = await invite(email);

      expect(second.id).not.toBe(first.id);
      expect(second.email).toBe(email);
    });

    it('deve responder 404 para um ADMIN já excluído ou para os ids de SUPER_ADMIN e CLIENT', async () => {
      const admin = await invite();
      const client = await createUser(Role.CLIENT);
      await request('DELETE', `/admins/${admin.id}`);

      for (const id of [admin.id, superAdmin.id, client.id]) {
        await expect(request('DELETE', `/admins/${id}`)).resolves.toHaveProperty('status', 404);
      }
      await expect(findRow(client.id)).resolves.toMatchObject({ deletedAt: null });
      await expect(supertokens.getUser(client.id)).resolves.toBeDefined();
    });

    it('deve responder 403 para um ADMIN (RN04)', async () => {
      const target = await invite();
      const admin = await createUser(Role.ADMIN);

      const response = await request('DELETE', `/admins/${target.id}`, {
        accessToken: admin.accessToken,
      });

      expect(response.status).toBe(403);
      await expect(findRow(target.id)).resolves.toMatchObject({ deletedAt: null });
    });
  });
});
