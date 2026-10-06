import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { LOGIN_LOCKED_MESSAGE } from '@modules/auth/infra/supertokens/email-password.overrides';
import { PASSWORD_CHANGED_MAIL_SUBJECT } from '@modules/users/application/services/password-changed-notice';
import { PASSWORD_RESET_MAIL_SUBJECT } from '@modules/users/application/services/password-reset.service';
import { UserRepository } from '@modules/users/domain/repositories/user.repository';
import { UserTokenRepository } from '@modules/users/domain/repositories/user-token.repository';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { LoginAttemptOrmEntity } from '@modules/users/infra/database/entities/login-attempt.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import {
  UserTokenOrmEntity,
  UserTokenTypeColumn,
} from '@modules/users/infra/database/entities/user-token.orm-entity';
import {
  UserOrmEntity,
  UserStatusColumn,
} from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { BackgroundTasks } from '@shared/application/ports/background-tasks';
import { MailDeliveryError, MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { deleteLoginAttempts } from './support/login-attempts';
import { MemoryLogger } from './support/memory-logger';

const PASSWORD = 'senha-forte-1';
const NEW_PASSWORD = 'senha-nova-2';
const MINUTE_IN_MS = 60 * 1000;

const INVALID_TOKEN = {
  statusCode: 422,
  error: 'Unprocessable Entity',
  message: 'Link inválido, expirado ou já utilizado.',
  details: { field: 'token' },
};

interface TestUser {
  id: string;
  email: string;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('Recuperação de senha por e-mail (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  const mailSender = new FakeMailSender();
  const logger = new MemoryLogger();
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(mailSender)
      .compile();
    app = moduleRef.createNestApplication({ logger });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    mailSender.messages.length = 0;
  });

  afterAll(async () => {
    await deleteLoginAttempts(dataSource, emails);
    // Os tokens saem junto com o usuário (ON DELETE CASCADE).
    await dataSource?.getRepository(UserOrmEntity).delete({ id: In(createdIds) });
    await Promise.all(createdIds.map((id) => supertokens.deleteUser(id)));
    await dataSource?.destroy();
    await app?.close();
  });

  /** E-mail novo a cada teste, para o limite de um e-mail por minuto de um não valer no outro. */
  function newEmail(): string {
    const email = `reset.${randomUUID()}@reportaai.invalid`;
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

  function post(path: string, body?: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** O pedido é respondido antes de ser atendido, então o teste espera o trabalho terminar. */
  async function requestReset(email: string): Promise<Response> {
    const response = await post('/password-resets', { email });
    await app.get(BackgroundTasks).drain();

    return response;
  }

  function confirm(token: string, password = NEW_PASSWORD): Promise<Response> {
    return post('/password-resets/confirm', { token, password });
  }

  /** Segredo do link de redefinição do último e-mail enviado ao endereço. */
  function lastSecret(email: string): string {
    const message = mailSender.messages.findLast(
      ({ to, subject }) => to === email && subject === PASSWORD_RESET_MAIL_SUBJECT,
    );
    const match = /\/redefinir-senha\?token=([\w-]+)/.exec(message?.text ?? '');

    if (!match) {
      throw new Error(`Nenhum link de redefinição foi enviado para ${email}.`);
    }

    return match[1];
  }

  /** Pede a redefinição e devolve o segredo do link enviado. */
  async function requestSecret(email: string): Promise<string> {
    await requestReset(email);

    return lastSecret(email);
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

  async function signInStatus(email: string, password: string): Promise<unknown> {
    const body = (await (await signInRequest(email, password)).json()) as { status: string };

    return body.status;
  }

  function refresh(refreshToken: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshToken}`, 'st-auth-mode': 'header' },
    });
  }

  function findUser(id: string): Promise<UserOrmEntity> {
    return dataSource.getRepository(UserOrmEntity).findOneByOrFail({ id });
  }

  function findTokens(userId: string): Promise<UserTokenOrmEntity[]> {
    return dataSource.getRepository(UserTokenOrmEntity).findBy({ userId });
  }

  /** Grava um token do usuário direto no banco, com o segredo informado. */
  async function insertToken(
    userId: string,
    type: UserTokenTypeColumn,
    secret: string,
  ): Promise<void> {
    await dataSource.getRepository(UserTokenOrmEntity).insert({
      id: randomUUID(),
      userId,
      type,
      tokenHash: sha256(secret),
      expiresAt: new Date(Date.now() + 60 * MINUTE_IN_MS),
    });
  }

  /** Recua a emissão dos tokens do usuário, como se o intervalo de um minuto tivesse passado. */
  async function passResendInterval(userId: string): Promise<void> {
    await dataSource
      .getRepository(UserTokenOrmEntity)
      .update({ userId }, { createdAt: new Date(Date.now() - MINUTE_IN_MS - 1000) });
  }

  describe('POST /api/password-resets', () => {
    it('deve responder 204 e enviar o link, guardando só o hash do token (60 min)', async () => {
      const user = await createUser();

      const response = await requestReset(user.email);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      const secret = lastSecret(user.email);
      expect(mailSender.messages).toHaveLength(1);
      expect(mailSender.messages[0].to).toBe(user.email);
      expect(mailSender.messages[0].text).toContain(
        `${env.WEB_APP_URL}/redefinir-senha?token=${secret}`,
      );
      const tokens = await findTokens(user.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        type: 'PASSWORD_RESET',
        tokenHash: sha256(secret),
        usedAt: null,
      });
      expect(tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime()).toBe(
        env.PASSWORD_RESET_EXPIRES_IN_MINUTES * MINUTE_IN_MS,
      );
    });

    it('deve encontrar a conta pelo e-mail com maiúsculas e espaços', async () => {
      const user = await createUser();

      const response = await requestReset(`  ${user.email.toUpperCase()} `);

      expect(response.status).toBe(204);
      expect(mailSender.messages.map(({ to }) => to)).toEqual([user.email]);
    });

    it('deve responder sem esperar a busca da conta nem o envio do e-mail', async () => {
      const user = await createUser();
      const repository = app.get(UserRepository);
      const findByEmail = repository.findByEmail.bind(repository);
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      jest.spyOn(repository, 'findByEmail').mockImplementationOnce(async (email) => {
        await held;

        return findByEmail(email);
      });

      const response = await post('/password-resets', { email: user.email });

      // A resposta chegou com a busca da conta ainda parada.
      expect(response.status).toBe(204);
      expect(mailSender.messages).toHaveLength(0);
      await expect(findTokens(user.id)).resolves.toHaveLength(0);
      release();
      await app.get(BackgroundTasks).drain();
      expect(mailSender.messages).toHaveLength(1);
    });

    it('deve responder 204 a um e-mail sem conta, sem enviar e-mail', async () => {
      const response = await requestReset(newEmail());

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      expect(mailSender.messages).toHaveLength(0);
    });

    it.each(['PENDING', 'INACTIVE'] as const)(
      'deve responder 204 a uma conta %s, sem enviar e-mail nem gravar token',
      async (status) => {
        const user = await createUser(status);

        const response = await requestReset(user.email);

        expect(response.status).toBe(204);
        expect(mailSender.messages).toHaveLength(0);
        await expect(findTokens(user.id)).resolves.toHaveLength(0);
      },
    );

    it('deve responder 204 a uma conta excluída, sem enviar e-mail nem gravar token', async () => {
      const user = await createUser();
      await dataSource
        .getRepository(UserOrmEntity)
        .update({ id: user.id }, { deletedAt: new Date() });

      const response = await requestReset(user.email);

      expect(response.status).toBe(204);
      expect(mailSender.messages).toHaveLength(0);
      await expect(findTokens(user.id)).resolves.toHaveLength(0);
    });

    it('deve invalidar o link anterior quando um novo é pedido (RN20)', async () => {
      const user = await createUser();
      const oldSecret = await requestSecret(user.email);
      await passResendInterval(user.id);

      const newSecret = await requestSecret(user.email);

      expect(newSecret).not.toBe(oldSecret);
      expect(mailSender.messages).toHaveLength(2);
      await expect(findTokens(user.id)).resolves.toHaveLength(1);
      const replaced = await confirm(oldSecret);
      expect(replaced.status).toBe(422);
      await expect(replaced.json()).resolves.toEqual(INVALID_TOKEN);
      await expect(confirm(newSecret)).resolves.toHaveProperty('status', 204);
    });

    it('deve enviar no máximo um e-mail por minuto para a mesma conta, mantendo o link', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);

      const second = await requestReset(user.email);
      const third = await requestReset(user.email);

      expect(second.status).toBe(204);
      expect(third.status).toBe(204);
      expect(mailSender.messages).toHaveLength(1);
      await expect(findTokens(user.id)).resolves.toHaveLength(1);
      await expect(confirm(secret)).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 204 quando o envio do e-mail falha', async () => {
      const user = await createUser();
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const response = await requestReset(user.email);

      expect(response.status).toBe(204);
      expect(mailSender.messages).toHaveLength(0);
    });

    it('deve responder 204 e registrar só no log uma falha ao atender o pedido', async () => {
      const user = await createUser();
      jest
        .spyOn(app.get(UserTokenRepository), 'replace')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));

      const response = await requestReset(user.email);

      expect(response.status).toBe(204);
      expect(mailSender.messages).toHaveLength(0);
      expect(logger.lines.join('\n')).toContain(
        'Falha na tarefa em segundo plano "Pedido de redefinição de senha": Falha no MySQL.',
      );
    });

    it.each([
      ['fora do formato', { email: 'nao-e-um-email' }],
      ['ausente', {}],
    ])('deve responder 400 para um e-mail %s', async (_case, body) => {
      const response = await post('/password-resets', body);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        details: [expect.objectContaining({ field: 'email' })],
      });
    });
  });

  describe('POST /api/password-resets/confirm', () => {
    it('deve gravar a senha nova: a antiga não entra, a nova entra e o token fica usado', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);

      const response = await confirm(secret);

      expect(response.status).toBe(204);
      await expect(signInStatus(user.email, PASSWORD)).resolves.toBe('WRONG_CREDENTIALS_ERROR');
      await expect(signInStatus(user.email, NEW_PASSWORD)).resolves.toBe('OK');
      const [token] = await findTokens(user.id);
      expect(token.usedAt).toBeInstanceOf(Date);
    });

    it('deve revogar todas as sessões: as abertas antes deixam de renovar (RN21)', async () => {
      const user = await createUser();
      const phone = await signIn(user.email, PASSWORD);
      const notebook = await signIn(user.email, PASSWORD);
      await expect(Session.getAllSessionHandlesForUser(user.id)).resolves.toHaveLength(2);
      const secret = await requestSecret(user.email);

      const response = await confirm(secret);

      expect(response.status).toBe(204);
      await expect(Session.getAllSessionHandlesForUser(user.id)).resolves.toEqual([]);
      await expect(refresh(phone.refreshToken)).resolves.toHaveProperty('status', 401);
      await expect(refresh(notebook.refreshToken)).resolves.toHaveProperty('status', 401);
    });

    it('deve preencher o email_verified_at de quem ainda não verificou o e-mail', async () => {
      const user = await createUser();
      await expect(findUser(user.id)).resolves.toMatchObject({ emailVerifiedAt: null });
      const secret = await requestSecret(user.email);

      await confirm(secret);

      const row = await findUser(user.id);
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('deve manter o email_verified_at de quem já tinha o e-mail verificado', async () => {
      const user = await createUser();
      const verifiedAt = new Date('2026-09-28T12:00:00.000Z');
      await dataSource
        .getRepository(UserOrmEntity)
        .update({ id: user.id }, { emailVerifiedAt: verifiedAt });
      const secret = await requestSecret(user.email);

      await confirm(secret);

      await expect(findUser(user.id)).resolves.toMatchObject({ emailVerifiedAt: verifiedAt });
    });

    it('deve zerar o bloqueio do login por tentativas (RN21)', async () => {
      const user = await createUser();
      for (let count = 0; count < env.LOGIN_MAX_FAILED_ATTEMPTS; count += 1) {
        await signInRequest(user.email, 'senha-errada-1');
      }
      const locked = await signInRequest(user.email, PASSWORD);
      await expect(locked.json()).resolves.toEqual({
        status: 'GENERAL_ERROR',
        message: LOGIN_LOCKED_MESSAGE,
      });
      const secret = await requestSecret(user.email);

      await confirm(secret);

      await expect(signInStatus(user.email, NEW_PASSWORD)).resolves.toBe('OK');
    });

    it('deve avisar o usuário da troca por e-mail, sem a senha', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);

      await confirm(secret);

      const notice = mailSender.messages.at(-1);
      expect(mailSender.messages).toHaveLength(2);
      expect(notice).toMatchObject({ to: user.email, subject: PASSWORD_CHANGED_MAIL_SUBJECT });
      expect(notice?.text).not.toContain(NEW_PASSWORD);
    });

    it('deve responder 204 quando o e-mail de aviso falha', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const response = await confirm(secret);

      expect(response.status).toBe(204);
      await expect(signInStatus(user.email, NEW_PASSWORD)).resolves.toBe('OK');
    });

    it('deve responder 422 para um token inexistente', async () => {
      const response = await confirm('token-que-nao-existe');

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
    });

    it('deve responder 422 para um token já usado, sem trocar a senha de novo', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);
      await confirm(secret);

      const response = await confirm(secret, 'outra-senha-3');

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
      await expect(signInStatus(user.email, NEW_PASSWORD)).resolves.toBe('OK');
    });

    it('deve responder 422 para um token expirado, sem trocar a senha', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);
      await dataSource
        .getRepository(UserTokenOrmEntity)
        .update({ userId: user.id }, { expiresAt: new Date(Date.now() - 1000) });

      const response = await confirm(secret);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
      await expect(signInStatus(user.email, PASSWORD)).resolves.toBe('OK');
    });

    it.each(['INVITATION', 'EMAIL_VERIFICATION'] as const)(
      'deve responder 422 para um token do tipo %s, sem trocar a senha',
      async (type) => {
        const user = await createUser();
        const secret = `segredo-${randomUUID()}`;
        await insertToken(user.id, type, secret);

        const response = await confirm(secret);

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
        await expect(signInStatus(user.email, PASSWORD)).resolves.toBe('OK');
        const [token] = await findTokens(user.id);
        expect(token.usedAt).toBeNull();
      },
    );

    it('deve responder 422 para o token de uma conta inativada depois do pedido', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);
      await dataSource.getRepository(UserOrmEntity).update({ id: user.id }, { status: 'INACTIVE' });

      const response = await confirm(secret);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
      const [token] = await findTokens(user.id);
      expect(token.usedAt).toBeNull();
    });

    it('deve responder 400 para uma senha fora da política, sem consumir o token (RN08)', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);

      const response = await confirm(secret, 'somenteletras');

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        details: [
          { field: 'password', message: 'A senha deve ter pelo menos uma letra e um número.' },
        ],
      });
      const [token] = await findTokens(user.id);
      expect(token.usedAt).toBeNull();
      await expect(signInStatus(user.email, PASSWORD)).resolves.toBe('OK');
      await expect(confirm(secret)).resolves.toHaveProperty('status', 204);
    });

    it('deve permitir redefinir de novo quando a gravação no MySQL falha', async () => {
      const user = await createUser();
      const secret = await requestSecret(user.email);
      jest
        .spyOn(app.get(UserRepository), 'saveWithToken')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));

      const failed = await confirm(secret);

      expect(failed.status).toBe(500);
      const [token] = await findTokens(user.id);
      expect(token.usedAt).toBeNull();
      await expect(confirm(secret)).resolves.toHaveProperty('status', 204);
      await expect(signInStatus(user.email, NEW_PASSWORD)).resolves.toBe('OK');
    });
  });

  describe('Token e senha fora do banco e do log', () => {
    it('nunca deve gravar o token puro em user_tokens nem escrever o token ou a senha no log', async () => {
      const user = await createUser();
      const password = `senha-${randomUUID()}-1`;
      const secret = await requestSecret(user.email);
      // Um 500 no meio da redefinição é o caminho que mais escreve no log.
      jest
        .spyOn(app.get(UserRepository), 'saveWithToken')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));
      await confirm(secret, password);
      await confirm(secret, password);
      await confirm(secret, password);

      const rows = await dataSource.query<Record<string, unknown>[]>(
        'SELECT * FROM user_tokens WHERE user_id = ?',
        [user.id],
      );
      const log = logger.lines.join('\n');
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect(log).toContain('Falha no MySQL.');
      expect(log).not.toContain(secret);
      expect(log).not.toContain(password);
    });
  });
});
