import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { CurrentUser } from '@modules/auth/presentation/decorators/current-user.decorator';
import { Public } from '@modules/auth/presentation/decorators/public.decorator';
import { Roles } from '@modules/auth/presentation/decorators/roles.decorator';
import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import {
  UserOrmEntity,
  UserStatusColumn,
} from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

/** Rotas só de teste, para exercitar o AuthGuard e os decorators. */
@Controller('test-auth')
class AuthProbeController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get('panel')
  panel(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('public')
  open(): { ok: true } {
    return { ok: true };
  }
}

const PASSWORD = 'senha-forte-1';

interface TestUser {
  id: string;
  email: string;
}

describe('Autenticação e controle de acesso (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  const createdIds: string[] = [];
  let dataSource: DataSource;
  let app: INestApplication;
  let baseUrl: string;

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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await dataSource?.getRepository(UserOrmEntity).delete({ id: In(createdIds) });
    await Promise.all(createdIds.map((id) => supertokens.deleteUser(id)));
    await dataSource?.destroy();
    await app?.close();
  });

  /** Cria a credencial no SuperTokens e, sem `mysql: false`, o usuário no MySQL com o mesmo id. */
  async function createUser(
    options: {
      role?: Role;
      status?: UserStatusColumn;
      deletedAt?: Date;
      mysql?: boolean;
    } = {},
  ): Promise<TestUser> {
    const email = Email.create(`auth.${randomUUID()}@reportaai.invalid`);
    const id = await identityProvider.createCredentials(email, Password.create(PASSWORD));
    createdIds.push(id);

    if (options.mysql !== false) {
      await dataSource.getRepository(UserOrmEntity).insert({
        id,
        roleId: ROLE_IDS[options.role ?? Role.CLIENT],
        name: 'Usuário de teste',
        email: email.value,
        status: options.status ?? 'ACTIVE',
        deletedAt: options.deletedAt ?? null,
      });
    }

    return { id, email: email.value };
  }

  function signIn(user: TestUser, authMode: 'header' | 'cookie' = 'header'): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        rid: 'emailpassword',
        'st-auth-mode': authMode,
      },
      body: JSON.stringify({
        formFields: [
          { id: 'email', value: user.email },
          { id: 'password', value: PASSWORD },
        ],
      }),
    });
  }

  /** Faz login no modo header (app mobile) e retorna o access token. */
  async function signInWithHeader(user: TestUser): Promise<string> {
    const response = await signIn(user);
    const accessToken = response.headers.get('st-access-token');

    if (!accessToken) {
      throw new Error(`Login falhou: ${JSON.stringify(await response.json())}`);
    }

    return accessToken;
  }

  function get(path: string, accessToken?: string): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });
  }

  describe('SuperTokens', () => {
    it('deve alcançar o SuperTokens Core', async () => {
      const response = await fetch(new URL('/hello', env.SUPERTOKENS_CONNECTION_URI));

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain('Hello');
    });

    it('deve liberar no CORS o painel web e os headers do SuperTokens', async () => {
      const response = await fetch(`${baseUrl}/api/auth/signin`, {
        method: 'OPTIONS',
        headers: {
          origin: env.WEB_APP_URL,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,rid,st-auth-mode',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(env.WEB_APP_URL);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('access-control-allow-headers')).toEqual(
        expect.stringContaining('st-auth-mode'),
      );
    });

    it.each([
      ['POST', '/api/auth/signup'],
      ['GET', '/api/auth/signup/email/exists?email=alguem@reportaai.invalid'],
      ['POST', '/api/auth/user/password/reset/token'],
      ['POST', '/api/auth/user/password/reset'],
    ])('deve responder 404 na rota desativada %s %s', async (method, path) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', rid: 'emailpassword' },
        ...(method === 'POST' ? { body: JSON.stringify({ formFields: [] }) } : {}),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Sign-in', () => {
    it('deve fazer login de um usuário ACTIVE e registrar o último acesso', async () => {
      const user = await createUser();

      const response = await signIn(user);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
      expect(response.headers.get('st-access-token')).toEqual(expect.any(String));
      expect(response.headers.get('st-refresh-token')).toEqual(expect.any(String));
      const row = await dataSource.getRepository(UserOrmEntity).findOneByOrFail({ id: user.id });
      expect(row.lastLoginAt).toBeInstanceOf(Date);
    });

    it.each([
      ['INACTIVE', { status: 'INACTIVE' as const }],
      ['PENDING', { role: Role.ADMIN, status: 'PENDING' as const }],
      ['excluído', { deletedAt: new Date() }],
      ['sem cadastro no MySQL', { mysql: false }],
    ])('deve recusar o login de um usuário %s como credencial inválida', async (_case, options) => {
      const user = await createUser(options);

      const response = await signIn(user);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
      expect(response.headers.get('st-access-token')).toBeNull();
      await expect(Session.getAllSessionHandlesForUser(user.id)).resolves.toEqual([]);
    });

    it('deve responder a senha incorreta no formato do SuperTokens', async () => {
      const response = await fetch(`${baseUrl}/api/auth/signin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', rid: 'emailpassword' },
        body: JSON.stringify({
          formFields: [
            { id: 'email', value: 'ninguem@reportaai.invalid' },
            { id: 'password', value: 'senha-qualquer-1' },
          ],
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
    });
  });

  describe('AuthGuard', () => {
    it('deve manter o /api/health público', async () => {
      const response = await get('/health');

      expect(response.status).toBe(200);
    });

    it('deve liberar uma rota @Public() sem sessão', async () => {
      const response = await get('/test-auth/public');

      expect(response.status).toBe(200);
    });

    it('deve responder 401 numa rota sem @Public() quando não há sessão', async () => {
      const response = await get('/test-auth');

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ message: 'unauthorised' });
    });

    it('deve aceitar o access token por header (app) e expor o usuário no @CurrentUser()', async () => {
      const user = await createUser();
      const accessToken = await signInWithHeader(user);

      const response = await get('/test-auth', accessToken);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        id: user.id,
        role: Role.CLIENT,
        sessionHandle: expect.any(String) as string,
      });
    });

    it('deve aceitar o access token por cookie (painel web)', async () => {
      const user = await createUser({ role: Role.ADMIN });
      const signInResponse = await signIn(user, 'cookie');
      const cookies = signInResponse.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');

      const response = await fetch(`${baseUrl}/api/test-auth`, { headers: { cookie: cookies } });

      expect(signInResponse.headers.get('st-access-token')).toBeNull();
      expect(cookies).toContain('sAccessToken=');
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        id: user.id,
        role: Role.ADMIN,
        sessionHandle: expect.any(String) as string,
      });
    });

    it.each([
      [Role.SUPER_ADMIN, 200],
      [Role.ADMIN, 200],
      [Role.CLIENT, 403],
    ])('deve responder à rota @Roles(SUPER_ADMIN, ADMIN) com %s → %p', async (role, status) => {
      const user = await createUser({ role });
      const accessToken = await signInWithHeader(user);

      const response = await get('/test-auth/panel', accessToken);

      expect(response.status).toBe(status);
    });

    it.each([
      ['INACTIVE', { status: 'INACTIVE' as const }],
      ['excluído', { deletedAt: new Date() }],
    ])(
      'deve bloquear na requisição seguinte o usuário que ficou %s e encerrar a sessão',
      async (_case, change) => {
        const user = await createUser();
        const accessToken = await signInWithHeader(user);
        await expect(get('/test-auth', accessToken)).resolves.toHaveProperty('status', 200);

        await dataSource.getRepository(UserOrmEntity).update({ id: user.id }, change);
        const response = await get('/test-auth', accessToken);

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ statusCode: 401 });
        await expect(Session.getAllSessionHandlesForUser(user.id)).resolves.toEqual([]);
      },
    );
  });
});
