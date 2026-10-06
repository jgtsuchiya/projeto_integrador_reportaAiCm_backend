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
import { Role } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { deleteLoginAttempts } from './support/login-attempts';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';
const USER_AGENT = 'ReportaAiApp/1.0 (Android 16)';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const SESSION_NOT_FOUND = {
  statusCode: 404,
  error: 'Not Found',
  message: 'Sessão não encontrada.',
};

interface TestUser {
  id: string;
  email: string;
}

/** Sessão aberta por um login no modo header, como o app mobile recebe. */
interface TestSession {
  /** Session handle do SuperTokens, que a API devolve como o `id` da sessão. */
  id: string;
  accessToken: string;
  refreshToken: string;
}

/** Item do `GET /api/users/me/sessions`. */
interface SessionBody {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

/** O session handle vai no payload do access token, que é um JWT. */
function readSessionHandle(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as {
    sessionHandle: string;
  };

  return payload.sessionHandle;
}

describe('Sessões ativas do usuário (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  const createdIds: string[] = [];
  const emails: string[] = [];
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await dataSource?.getRepository(UserOrmEntity).delete({ id: In(createdIds) });
    await Promise.all(createdIds.map((id) => supertokens.deleteUser(id)));
    await deleteLoginAttempts(dataSource, emails);
    await dataSource?.destroy();
    await app?.close();
  });

  /** Cria a credencial no SuperTokens e o usuário ACTIVE no MySQL, com o mesmo id. */
  async function createUser(): Promise<TestUser> {
    const email = Email.create(`sessoes.${randomUUID()}@reportaai.invalid`);
    emails.push(email.value);
    const id = await identityProvider.createCredentials(email, Password.create(PASSWORD));
    createdIds.push(id);
    await dataSource.getRepository(UserOrmEntity).insert({
      id,
      roleId: ROLE_IDS[Role.CLIENT],
      name: 'Usuário de teste',
      email: email.value,
      status: 'ACTIVE',
    });

    return { id, email: email.value };
  }

  /** Abre uma sessão pelo login, com o user agent do aparelho. */
  async function signIn(user: TestUser, userAgent = USER_AGENT): Promise<TestSession> {
    const response = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        rid: 'emailpassword',
        'st-auth-mode': 'header',
        'user-agent': userAgent,
      },
      body: JSON.stringify({
        formFields: [
          { id: 'email', value: user.email },
          { id: 'password', value: PASSWORD },
        ],
      }),
    });
    const accessToken = response.headers.get('st-access-token');
    const refreshToken = response.headers.get('st-refresh-token');

    if (!accessToken || !refreshToken) {
      throw new Error(`Login falhou: ${response.status} ${await response.text()}`);
    }

    return { id: readSessionHandle(accessToken), accessToken, refreshToken };
  }

  function refresh(refreshToken: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshToken}`, 'st-auth-mode': 'header' },
    });
  }

  function request(method: string, path: string, accessToken?: string): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });
  }

  async function listSessions(accessToken: string): Promise<SessionBody[]> {
    const response = await request('GET', '/users/me/sessions', accessToken);

    if (response.status !== 200) {
      throw new Error(`Listagem falhou: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as SessionBody[];
  }

  describe('GET /api/users/me/sessions', () => {
    it('deve listar as sessões do usuário, da mais recente para a mais antiga, com a atual marcada (RN23)', async () => {
      const user = await createUser();
      const startedAt = Date.now();
      const phone = await signIn(user, 'ReportaAiApp/1.0 (Android 16)');
      const laptop = await signIn(user, 'Mozilla/5.0 (X11; Linux x86_64)');

      const response = await request('GET', '/users/me/sessions', phone.accessToken);

      expect(response.status).toBe(200);
      const sessions = (await response.json()) as SessionBody[];
      expect(sessions).toEqual([
        {
          id: laptop.id,
          createdAt: expect.any(String) as string,
          expiresAt: expect.any(String) as string,
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
          current: false,
        },
        {
          id: phone.id,
          createdAt: expect.any(String) as string,
          expiresAt: expect.any(String) as string,
          ipAddress: '127.0.0.1',
          userAgent: 'ReportaAiApp/1.0 (Android 16)',
          current: true,
        },
      ]);

      // A data do login é a de agora, e a validade é a do refresh token (7 dias no Core).
      const createdAt = Date.parse(sessions[1].createdAt);
      const expiresAt = Date.parse(sessions[1].expiresAt);
      // O relógio do Core é o do contêiner: a folga cobre uma diferença pequena para o do teste.
      expect(createdAt).toBeGreaterThanOrEqual(startedAt - 5000);
      expect(createdAt).toBeLessThanOrEqual(Date.now() + 5000);
      expect(expiresAt - createdAt).toBeGreaterThan(6 * DAY_IN_MS);
      expect(expiresAt - createdAt).toBeLessThan(8 * DAY_IN_MS);
    });

    it('deve manter o id, a origem do login e a marca de atual depois de a sessão ser renovada', async () => {
      const user = await createUser();
      const session = await signIn(user);

      const renewed = await refresh(session.refreshToken);
      const sessions = await listSessions(renewed.headers.get('st-access-token') ?? '');

      expect(renewed.status).toBe(200);
      expect(sessions).toEqual([
        expect.objectContaining({
          id: session.id,
          ipAddress: '127.0.0.1',
          userAgent: USER_AGENT,
          current: true,
        }),
      ]);
    });

    it('deve listar sem IP e sem user agent a sessão aberta antes de a origem ser guardada', async () => {
      const user = await createUser();
      const current = await signIn(user);
      const old = await Session.createNewSessionWithoutRequestResponse(
        TENANT_ID,
        supertokens.convertToRecipeUserId(user.id),
      );
      // Como as sessões criadas antes do override: sem nenhum dado no Core.
      await Session.updateSessionDataInDatabase(old.getHandle(), {});

      const sessions = await listSessions(current.accessToken);

      expect(sessions).toHaveLength(2);
      expect(sessions).toContainEqual({
        id: old.getHandle(),
        createdAt: expect.any(String) as string,
        expiresAt: expect.any(String) as string,
        ipAddress: null,
        userAgent: null,
        current: false,
      });
    });

    it('deve cortar o user agent do login em 255 caracteres', async () => {
      const user = await createUser();
      const session = await signIn(user, 'a'.repeat(300));

      const sessions = await listSessions(session.accessToken);

      expect(sessions.map(({ userAgent }) => userAgent)).toEqual(['a'.repeat(255)]);
    });

    it('não deve listar as sessões de outro usuário', async () => {
      const user = await createUser();
      const session = await signIn(user);
      await signIn(await createUser());

      const sessions = await listSessions(session.accessToken);

      expect(sessions.map(({ id }) => id)).toEqual([session.id]);
    });

    it('deve responder 401 sem sessão', async () => {
      const response = await request('GET', '/users/me/sessions');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/users/me/sessions/:id', () => {
    function revoke(id: string, accessToken?: string): Promise<Response> {
      return request('DELETE', `/users/me/sessions/${id}`, accessToken);
    }

    it('deve encerrar a sessão informada, que deixa de renovar, e manter as outras (RN23)', async () => {
      const user = await createUser();
      const current = await signIn(user);
      const other = await signIn(user);

      const response = await revoke(other.id, current.accessToken);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      await expect(listSessions(current.accessToken)).resolves.toEqual([
        expect.objectContaining({ id: current.id, current: true }),
      ]);
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 401);
      await expect(refresh(current.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve continuar aceitando, até expirar, o access token já emitido da sessão encerrada', async () => {
      const user = await createUser();
      const current = await signIn(user);
      const other = await signIn(user);

      await revoke(other.id, current.accessToken);

      // Como no signout: o access token é conferido pela assinatura, sem consulta ao Core.
      // A sessão dele já saiu da lista, então nenhuma vem marcada como a atual.
      await expect(listSessions(other.accessToken)).resolves.toEqual([
        expect.objectContaining({ id: current.id, current: false }),
      ]);
    });

    it('deve encerrar a sessão da própria requisição', async () => {
      const user = await createUser();
      const current = await signIn(user);
      const other = await signIn(user);

      const response = await revoke(current.id, current.accessToken);

      expect(response.status).toBe(204);
      await expect(refresh(current.refreshToken)).resolves.toHaveProperty('status', 401);
      await expect(refresh(other.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve responder 404 para a sessão de outro usuário, sem encerrá-la', async () => {
      const session = await signIn(await createUser());
      const stranger = await signIn(await createUser());

      const response = await revoke(stranger.id, session.accessToken);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(SESSION_NOT_FOUND);
      await expect(refresh(stranger.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it.each([
      ['que não existe', randomUUID()],
      ['fora do formato do SuperTokens', 'nao-e-um-handle'],
    ])('deve responder 404 para um id %s', async (_case, id) => {
      const session = await signIn(await createUser());

      const response = await revoke(id, session.accessToken);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(SESSION_NOT_FOUND);
    });

    it('deve responder 404 para uma sessão que já foi encerrada', async () => {
      const user = await createUser();
      const current = await signIn(user);
      const other = await signIn(user);
      await revoke(other.id, current.accessToken);

      const response = await revoke(other.id, current.accessToken);

      expect(response.status).toBe(404);
    });

    it('deve responder 401 sem sessão, sem encerrar a sessão informada', async () => {
      const session = await signIn(await createUser());

      const response = await revoke(session.id);

      expect(response.status).toBe(401);
      await expect(refresh(session.refreshToken)).resolves.toHaveProperty('status', 200);
    });
  });

  describe('DELETE /api/users/me/sessions', () => {
    it('deve encerrar todas as outras sessões e manter a atual (RN23)', async () => {
      const user = await createUser();
      const current = await signIn(user);
      const phone = await signIn(user);
      const laptop = await signIn(user);

      const response = await request('DELETE', '/users/me/sessions', current.accessToken);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      await expect(listSessions(current.accessToken)).resolves.toEqual([
        expect.objectContaining({ id: current.id, current: true }),
      ]);
      await expect(refresh(phone.refreshToken)).resolves.toHaveProperty('status', 401);
      await expect(refresh(laptop.refreshToken)).resolves.toHaveProperty('status', 401);
      await expect(refresh(current.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('não deve encerrar as sessões de outro usuário', async () => {
      const session = await signIn(await createUser());
      const stranger = await signIn(await createUser());

      const response = await request('DELETE', '/users/me/sessions', session.accessToken);

      expect(response.status).toBe(204);
      await expect(refresh(stranger.refreshToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve responder 204 quando só existe a sessão atual', async () => {
      const session = await signIn(await createUser());

      const response = await request('DELETE', '/users/me/sessions', session.accessToken);

      expect(response.status).toBe(204);
      await expect(listSessions(session.accessToken)).resolves.toHaveLength(1);
    });

    it('deve responder 401 sem sessão', async () => {
      const response = await request('DELETE', '/users/me/sessions');

      expect(response.status).toBe(401);
    });
  });
});
