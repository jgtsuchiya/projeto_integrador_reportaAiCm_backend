import { randomInt, randomUUID } from 'node:crypto';
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
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface TestClient extends TestUser {
  /** Só dígitos. */
  cpf: string;
  name: string;
}

interface ClientBody {
  id: string;
  role: string;
  name: string;
  email: string;
  status: string;
  cpf: string;
  phone: string;
  birthDate: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PageBody {
  items: ClientBody[];
  page: number;
  pageSize: number;
  total: number;
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

function maskCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

describe('Gestão de Clients pelo painel (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  const emails: string[] = [];
  const createdIds: string[] = [];
  let dataSource: DataSource;
  let app: INestApplication;
  let baseUrl: string;
  let superAdmin: TestUser;
  let admin: TestUser;

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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    // Em produção, os papéis são criados no SuperTokens pelo seed.
    await identityProvider.createRoles(ROLES);
    superAdmin = await createStaff(Role.SUPER_ADMIN);
    admin = await createStaff(Role.ADMIN);
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
    await dataSource?.destroy();
    await app?.close();
  });

  function newEmail(prefix: string): string {
    const email = `${prefix}.${randomUUID()}@reportaai.invalid`;
    emails.push(email);

    return email;
  }

  /** Cria o SUPER_ADMIN ou o ADMIN direto no SuperTokens e no MySQL, e faz login. */
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
      createdById: role === Role.ADMIN ? superAdmin.id : null,
    });

    return { id, email, accessToken: await signIn(email, PASSWORD) };
  }

  /** Cadastra o Client pela rota do app e faz login. */
  async function createClient(name = 'Maria da Silva'): Promise<TestClient> {
    const email = newEmail('client');
    const cpf = randomCpf();
    const response = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password: PASSWORD,
        cpf,
        phone: '(43) 99999-8888',
        birthDate: '1990-05-20',
      }),
    });

    if (response.status !== 201) {
      throw new Error(`Cadastro falhou: ${response.status} ${await response.text()}`);
    }

    const { id } = (await response.json()) as { id: string };
    createdIds.push(id);

    return { id, email, cpf, name, accessToken: await signIn(email, PASSWORD) };
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
    { body, accessToken = admin.accessToken }: { body?: unknown; accessToken?: string } = {},
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

  async function list(query: string, accessToken?: string): Promise<PageBody> {
    const response = await request('GET', `/clients?pageSize=100&${query}`, { accessToken });

    expect(response.status).toBe(200);

    return (await response.json()) as PageBody;
  }

  function findRow(id: string): Promise<UserOrmEntity | null> {
    return dataSource.getRepository(UserOrmEntity).findOne({ where: { id }, withDeleted: true });
  }

  describe('GET /api/clients', () => {
    it('deve listar os CLIENTs paginados, com o CPF mascarado e sem outros papéis', async () => {
      const client = await createClient();

      const response = await request('GET', '/clients?pageSize=100');

      expect(response.status).toBe(200);
      const text = await response.text();
      const body = JSON.parse(text) as PageBody;
      expect(body).toMatchObject({ page: 1, pageSize: 100 });
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.items.every((item) => item.role === Role.CLIENT)).toBe(true);
      expect(body.items.find((item) => item.id === client.id)).toEqual({
        id: client.id,
        role: Role.CLIENT,
        name: 'Maria da Silva',
        email: client.email,
        status: 'ACTIVE',
        cpf: maskCpf(client.cpf),
        phone: '43999998888',
        birthDate: '1990-05-20',
        lastLoginAt: expect.any(String) as string,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
      // O CPF nunca aparece completo (RN12).
      expect(text).not.toContain(client.cpf);
    });

    it('deve atender também o SUPER_ADMIN', async () => {
      const client = await createClient();

      const body = await list(`search=${client.email}`, superAdmin.accessToken);

      expect(body.items.map(({ id }) => id)).toEqual([client.id]);
    });

    it('deve filtrar pelo status', async () => {
      const client = await createClient();
      await request('PATCH', `/clients/${client.id}/status`, { body: { status: 'INACTIVE' } });

      const body = await list('status=INACTIVE');

      expect(body.items.map(({ id }) => id)).toContain(client.id);
      expect(body.items.every((item) => item.status === 'INACTIVE')).toBe(true);
    });

    it('deve buscar por um trecho do nome ou do e-mail', async () => {
      const tag = randomUUID().slice(0, 8);
      const client = await createClient(`Joana Conceição ${tag}`);
      await createClient();

      const byName = await list(`search=${encodeURIComponent(`conceicao ${tag}`)}`);
      const byEmail = await list(`search=${client.email.slice(0, 20)}`);

      expect(byName.items.map(({ id }) => id)).toEqual([client.id]);
      expect(byEmail.items.map(({ id }) => id)).toEqual([client.id]);
    });

    it('deve buscar pelo CPF exato, com ou sem máscara, e não por um trecho dele', async () => {
      const client = await createClient();
      const formatted = client.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

      const byDigits = await list(`search=${client.cpf}`);
      const byFormatted = await list(`search=${formatted}`);
      const byPart = await list(`search=${client.cpf.slice(0, 9)}`);

      expect(byDigits.items.map(({ id }) => id)).toEqual([client.id]);
      expect(byFormatted.items.map(({ id }) => id)).toEqual([client.id]);
      expect(byPart.items.map(({ id }) => id)).not.toContain(client.id);
    });

    it('não deve listar os CLIENTs excluídos', async () => {
      const client = await createClient();
      await dataSource.getRepository(UserOrmEntity).softDelete({ id: client.id });

      const body = await list(`search=${client.cpf}`);

      expect(body).toMatchObject({ items: [], total: 0 });
    });

    it('deve responder 400 para uma query inválida', async () => {
      const response = await request('GET', '/clients?pageSize=101&status=PENDING');

      expect(response.status).toBe(400);
      const body = (await response.json()) as { details: Array<{ field: string }> };
      expect(body.details.map(({ field }) => field)).toEqual(['pageSize', 'status']);
    });

    it('deve responder 403 para um CLIENT', async () => {
      const client = await createClient();

      await expect(
        request('GET', '/clients', { accessToken: client.accessToken }),
      ).resolves.toHaveProperty('status', 403);
    });

    it('deve responder 401 sem sessão', async () => {
      await expect(request('GET', '/clients', { accessToken: '' })).resolves.toHaveProperty(
        'status',
        401,
      );
    });
  });

  describe('GET /api/clients/:id', () => {
    it.each(['ADMIN', 'SUPER_ADMIN'])(
      'deve retornar o CLIENT com o CPF mascarado para um %s',
      async (role) => {
        const client = await createClient();
        const accessToken = role === 'ADMIN' ? admin.accessToken : superAdmin.accessToken;

        const response = await request('GET', `/clients/${client.id}`, { accessToken });

        expect(response.status).toBe(200);
        const text = await response.text();
        expect(JSON.parse(text)).toMatchObject({
          id: client.id,
          email: client.email,
          cpf: maskCpf(client.cpf),
        });
        expect(text).not.toContain(client.cpf);
      },
    );

    it('deve responder 404 para os ids de ADMIN, SUPER_ADMIN ou inexistente', async () => {
      for (const id of [admin.id, superAdmin.id, randomUUID()]) {
        await expect(request('GET', `/clients/${id}`)).resolves.toHaveProperty('status', 404);
      }
    });

    it('deve responder 400 para um id que não é UUID', async () => {
      await expect(request('GET', '/clients/nao-e-uuid')).resolves.toHaveProperty('status', 400);
    });

    it('deve responder 403 para um CLIENT, mesmo com o próprio id', async () => {
      const client = await createClient();

      const response = await request('GET', `/clients/${client.id}`, {
        accessToken: client.accessToken,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/clients/:id/status', () => {
    function changeStatus(
      id: string,
      body: Record<string, unknown>,
      accessToken?: string,
    ): Promise<Response> {
      return request('PATCH', `/clients/${id}/status`, { body, accessToken });
    }

    it('deve inativar o CLIENT, que perde o acesso na requisição seguinte (RN10)', async () => {
      const client = await createClient();
      // Com sessão válida, o CLIENT chega à rota e recebe 403 pelo papel.
      await expect(
        request('GET', '/clients', { accessToken: client.accessToken }),
      ).resolves.toHaveProperty('status', 403);

      const response = await changeStatus(client.id, { status: 'INACTIVE' });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: client.id,
        status: 'INACTIVE',
        cpf: maskCpf(client.cpf),
      });
      await expect(Session.getAllSessionHandlesForUser(client.id)).resolves.toEqual([]);
      await expect(
        request('GET', '/clients', { accessToken: client.accessToken }),
      ).resolves.toHaveProperty('status', 401);
      const signIn = await signInRequest(client.email, PASSWORD);
      await expect(signIn.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
    });

    it('deve reativar o CLIENT, que volta a fazer login', async () => {
      const client = await createClient();
      await changeStatus(client.id, { status: 'INACTIVE' });

      const response = await changeStatus(client.id, { status: 'ACTIVE' }, superAdmin.accessToken);

      expect(response.status).toBe(200);
      await expect(findRow(client.id)).resolves.toMatchObject({ status: 'ACTIVE' });
      const signIn = await signInRequest(client.email, PASSWORD);
      await expect(signIn.json()).resolves.toMatchObject({ status: 'OK' });
    });

    it('não deve alterar os dados do CLIENT (RN12)', async () => {
      const client = await createClient();

      const response = await changeStatus(client.id, {
        status: 'INACTIVE',
        name: 'Outro nome',
        email: 'outro@reportaai.invalid',
      });

      expect(response.status).toBe(200);
      await expect(findRow(client.id)).resolves.toMatchObject({
        name: client.name,
        email: client.email,
        status: 'INACTIVE',
      });
    });

    it('deve responder 422 ao inativar um CLIENT que já está inativo', async () => {
      const client = await createClient();
      await changeStatus(client.id, { status: 'INACTIVE' });

      await expect(changeStatus(client.id, { status: 'INACTIVE' })).resolves.toHaveProperty(
        'status',
        422,
      );
    });

    it('deve responder 400 para um status que não é ACTIVE nem INACTIVE', async () => {
      const client = await createClient();

      await expect(changeStatus(client.id, { status: 'PENDING' })).resolves.toHaveProperty(
        'status',
        400,
      );
    });

    it('deve responder 404 para os ids de ADMIN e SUPER_ADMIN', async () => {
      const target = await createStaff(Role.ADMIN);

      await expect(changeStatus(target.id, { status: 'INACTIVE' })).resolves.toHaveProperty(
        'status',
        404,
      );
      await expect(
        changeStatus(superAdmin.id, { status: 'INACTIVE' }, superAdmin.accessToken),
      ).resolves.toHaveProperty('status', 404);
      await expect(findRow(target.id)).resolves.toMatchObject({ status: 'ACTIVE' });
      await expect(findRow(superAdmin.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('deve responder 403 para um CLIENT', async () => {
      const target = await createClient();
      const client = await createClient();

      const response = await changeStatus(target.id, { status: 'INACTIVE' }, client.accessToken);

      expect(response.status).toBe(403);
      await expect(findRow(target.id)).resolves.toMatchObject({ status: 'ACTIVE' });
    });
  });
});
