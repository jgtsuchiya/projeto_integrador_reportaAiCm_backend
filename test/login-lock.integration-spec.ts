import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DataSource, In, Repository } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { LOGIN_LOCKED_MESSAGE } from '@modules/auth/infra/supertokens/email-password.overrides';
import { LoginLockService } from '@modules/users/application/services/login-lock.service';
import { PurgeLoginAttemptsUseCase } from '@modules/users/application/use-cases/purge-login-attempts.use-case';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { LoginAttemptOrmEntity } from '@modules/users/infra/database/entities/login-attempt.orm-entity';
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
import { deleteLoginAttempts } from './support/login-attempts';

const PASSWORD = 'senha-forte-1';
const WRONG_PASSWORD = 'senha-errada-1';
const USER_AGENT = 'login-lock-test/1.0';
const MINUTE_IN_MS = 60 * 1000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;

interface TestUser {
  id: string;
  email: string;
}

const WRONG_CREDENTIALS = { status: 'WRONG_CREDENTIALS_ERROR' };
const LOCKED = { status: 'GENERAL_ERROR', message: LOGIN_LOCKED_MESSAGE };

/** Respostas de `times` tentativas seguidas com a credencial inválida. */
function wrongCredentials(times: number): unknown[] {
  return Array.from({ length: times }, () => WRONG_CREDENTIALS);
}

/** Guarda tudo o que a API escreveria no log, para conferir que a senha não aparece. */
class MemoryLogger implements LoggerService {
  readonly lines: string[] = [];

  log = (...args: unknown[]): void => this.write(args);
  error = (...args: unknown[]): void => this.write(args);
  warn = (...args: unknown[]): void => this.write(args);
  debug = (...args: unknown[]): void => this.write(args);
  verbose = (...args: unknown[]): void => this.write(args);
  fatal = (...args: unknown[]): void => this.write(args);

  private write(args: unknown[]): void {
    this.lines.push(
      args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
    );
  }
}

describe('Bloqueio do login por tentativas (integração)', () => {
  const env = envSchema.parse(process.env);
  const MAX_FAILURES = env.LOGIN_MAX_FAILED_ATTEMPTS;
  const identityProvider = new SuperTokensIdentityProvider();
  const logger = new MemoryLogger();
  const createdIds: string[] = [];
  const emails: string[] = [];
  let dataSource: DataSource;
  let attempts: Repository<LoginAttemptOrmEntity>;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // Proteção: o teste grava no banco; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    dataSource = new DataSource({
      ...buildDataSourceOptions(env),
      entities: [
        RoleOrmEntity,
        UserOrmEntity,
        ClientProfileOrmEntity,
        UserTokenOrmEntity,
        LoginAttemptOrmEntity,
      ],
      migrations: [
        join(__dirname, '..', 'src', 'shared', 'infra', 'database', 'migrations', '*.ts'),
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    attempts = dataSource.getRepository(LoginAttemptOrmEntity);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await deleteLoginAttempts(dataSource, emails);
    await dataSource?.getRepository(UserOrmEntity).delete({ id: In(createdIds) });
    await Promise.all(createdIds.map((id) => supertokens.deleteUser(id)));
    await dataSource?.destroy();
    await app?.close();
  });

  /** E-mail novo a cada teste, para a contagem de um não entrar na de outro. */
  function newEmail(): string {
    const email = `lock.${randomUUID()}@reportaai.invalid`;
    emails.push(email);

    return email;
  }

  /** Cria a credencial no SuperTokens e o usuário no MySQL, com o mesmo id. */
  async function createUser(status: UserStatusColumn = 'ACTIVE'): Promise<TestUser> {
    const email = newEmail();
    const id = await identityProvider.createCredentials(
      Email.create(email),
      Password.create(PASSWORD),
    );
    createdIds.push(id);
    await dataSource.getRepository(UserOrmEntity).insert({
      id,
      roleId: ROLE_IDS[Role.CLIENT],
      name: 'Usuário de teste',
      email,
      status,
    });

    return { id, email };
  }

  function signIn(email: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        rid: 'emailpassword',
        'st-auth-mode': 'header',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({
        formFields: [
          { id: 'email', value: email },
          { id: 'password', value: password },
        ],
      }),
    });
  }

  /** Corpos das respostas de várias tentativas seguidas, na ordem. */
  async function signInTimes(times: number, email: string, password: string): Promise<unknown[]> {
    const bodies: unknown[] = [];
    for (let count = 0; count < times; count += 1) {
      bodies.push(await (await signIn(email, password)).json());
    }

    return bodies;
  }

  function attemptsOf(email: string): Promise<LoginAttemptOrmEntity[]> {
    return attempts.find({ where: { email }, order: { createdAt: 'ASC', id: 'ASC' } });
  }

  /** Leva a falha mais antiga do e-mail para fora da janela, como se o tempo tivesse passado. */
  async function expireOldestFailure(email: string): Promise<void> {
    const oldest = await attempts.findOneOrFail({
      where: { email, succeeded: false },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const outsideWindow = oldest.createdAt.getTime() - env.LOGIN_LOCK_WINDOW_MINUTES * MINUTE_IN_MS;

    await attempts.update({ id: oldest.id }, { createdAt: new Date(outsideWindow) });
  }

  describe('Bloqueio (RN17)', () => {
    it('deve recusar a senha correta depois do limite de senhas erradas, sem abrir sessão', async () => {
      const { id, email } = await createUser();

      const failures = await signInTimes(MAX_FAILURES, email, WRONG_PASSWORD);
      const response = await signIn(email, PASSWORD);

      expect(failures).toEqual(wrongCredentials(MAX_FAILURES));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(LOCKED);
      expect(response.headers.get('st-access-token')).toBeNull();
      await expect(Session.getAllSessionHandlesForUser(id)).resolves.toEqual([]);
    });

    it('deve aceitar a senha correta de novo quando uma das falhas sai da janela', async () => {
      const { email } = await createUser();
      await signInTimes(MAX_FAILURES, email, WRONG_PASSWORD);
      await expect(signInTimes(1, email, PASSWORD)).resolves.toEqual([LOCKED]);

      await expireOldestFailure(email);
      const response = await signIn(email, PASSWORD);

      await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
      expect(response.headers.get('st-access-token')).toEqual(expect.any(String));
    });

    it('deve responder a um e-mail sem conta a mesma sequência de um e-mail com conta', async () => {
      const { email: withAccount } = await createUser();
      const withoutAccount = newEmail();

      const known = await signInTimes(MAX_FAILURES + 2, withAccount, WRONG_PASSWORD);
      const unknown = await signInTimes(MAX_FAILURES + 2, withoutAccount, WRONG_PASSWORD);

      expect(known).toEqual([...wrongCredentials(MAX_FAILURES), LOCKED, LOCKED]);
      expect(unknown).toEqual(known);
    });

    it('deve zerar a contagem com um login com sucesso', async () => {
      const { email } = await createUser();
      await signInTimes(MAX_FAILURES - 1, email, WRONG_PASSWORD);

      const success = await signInTimes(1, email, PASSWORD);
      const afterSuccess = await signInTimes(MAX_FAILURES - 1, email, WRONG_PASSWORD);
      const stillAllowed = await signInTimes(1, email, PASSWORD);

      expect(success).toEqual([expect.objectContaining({ status: 'OK' })]);
      expect(afterSuccess).toEqual(wrongCredentials(MAX_FAILURES - 1));
      expect(stillAllowed).toEqual([expect.objectContaining({ status: 'OK' })]);
    });

    it.each(['INACTIVE', 'PENDING'] as const)(
      'deve contar como falha o login de um usuário %s com a senha correta (RN09)',
      async (status) => {
        const { email } = await createUser(status);

        const bodies = await signInTimes(MAX_FAILURES + 1, email, PASSWORD);

        expect(bodies).toEqual([...wrongCredentials(MAX_FAILURES), LOCKED]);
      },
    );

    it('deve contar o mesmo e-mail com maiúsculas e espaços diferentes', async () => {
      const { email } = await createUser();
      await signInTimes(MAX_FAILURES - 1, email, WRONG_PASSWORD);
      await signInTimes(1, `  ${email.toUpperCase()} `, WRONG_PASSWORD);

      await expect(signInTimes(1, email, PASSWORD)).resolves.toEqual([LOCKED]);
    });

    it('não deve bloquear outro e-mail', async () => {
      const { email: locked } = await createUser();
      const { email: other } = await createUser();
      await signInTimes(MAX_FAILURES, locked, WRONG_PASSWORD);

      const response = await signIn(other, PASSWORD);

      await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
    });

    it('deve liberar o login quando o bloqueio do e-mail é zerado', async () => {
      const { email } = await createUser();
      await signInTimes(MAX_FAILURES, email, WRONG_PASSWORD);

      await app.get(LoginLockService).clear(Email.create(email));
      const response = await signIn(email, PASSWORD);

      await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
    });
  });

  describe('Registro das tentativas (RN19)', () => {
    it('deve registrar a falha e o sucesso, com o e-mail normalizado, o IP e o user agent', async () => {
      const { email } = await createUser();

      await signIn(` ${email.toUpperCase()} `, WRONG_PASSWORD);
      await signIn(email, PASSWORD);

      const rows = await attemptsOf(email);
      expect(rows.map((row) => row.succeeded)).toEqual([false, true]);
      for (const row of rows) {
        expect(row).toMatchObject({ email, ipAddress: '127.0.0.1', userAgent: USER_AGENT });
        expect(row.createdAt).toBeInstanceOf(Date);
      }
    });

    it('deve registrar a tentativa de um e-mail sem conta', async () => {
      const email = newEmail();

      await signIn(email, WRONG_PASSWORD);

      await expect(attemptsOf(email)).resolves.toEqual([
        expect.objectContaining({ email, succeeded: false }),
      ]);
    });

    it('não deve registrar as tentativas recusadas pelo bloqueio', async () => {
      const { email } = await createUser();
      await signInTimes(MAX_FAILURES, email, WRONG_PASSWORD);

      await signInTimes(3, email, PASSWORD);

      const rows = await attemptsOf(email);
      expect(rows).toHaveLength(MAX_FAILURES);
      expect(rows.every((row) => !row.succeeded)).toBe(true);
    });

    it('não deve registrar a tentativa de um e-mail fora do formato (FIELD_ERROR)', async () => {
      const before = await attempts.count();

      const response = await signIn('nao-e-um-email', WRONG_PASSWORD);

      await expect(response.json()).resolves.toMatchObject({ status: 'FIELD_ERROR' });
      await expect(attempts.count()).resolves.toBe(before);
    });

    it('não deve registrar nem bloquear um e-mail que o SuperTokens aceita e a aplicação não', async () => {
      const email = `${'a'.repeat(65)}.${randomUUID()}@reportaai.invalid`;

      const bodies = await signInTimes(MAX_FAILURES + 1, email, WRONG_PASSWORD);

      expect(bodies).toEqual(wrongCredentials(MAX_FAILURES + 1));
      await expect(attemptsOf(email)).resolves.toEqual([]);
    });

    it('nunca deve gravar a senha em login_attempts nem escrevê-la no log', async () => {
      const { email } = await createUser();
      const secret = `segredo-${randomUUID()}-1`;

      await signIn(email, secret);
      await signInTimes(MAX_FAILURES, email, secret);

      const rows = await dataSource.query<Record<string, unknown>[]>(
        'SELECT * FROM login_attempts WHERE email = ?',
        [email],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(Object.keys(rows[0]).sort()).toEqual([
        'created_at',
        'email',
        'id',
        'ip_address',
        'succeeded',
        'user_agent',
      ]);
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect(logger.lines.join('\n')).not.toContain(secret);
    });
  });

  describe('Retenção (RN19)', () => {
    it('deve apagar as tentativas com mais de 30 dias e manter as mais novas', async () => {
      const email = newEmail();
      const insert = async (daysAgo: number): Promise<string> => {
        const id = randomUUID();
        await attempts.insert({
          id,
          email,
          succeeded: false,
          createdAt: new Date(Date.now() - daysAgo * DAY_IN_MS),
        });

        return id;
      };
      await insert(45);
      await insert(31);
      const kept = await insert(29);

      await app.get(PurgeLoginAttemptsUseCase).execute();

      const rows = await attemptsOf(email);
      expect(rows.map((row) => row.id)).toEqual([kept]);
    });
  });
});
