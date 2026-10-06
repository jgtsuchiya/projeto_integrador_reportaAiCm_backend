import { createHash, randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { EMAIL_VERIFICATION_MAIL_SUBJECT } from '@modules/users/application/services/email-verification.service';
import { UserRepository } from '@modules/users/domain/repositories/user.repository';
import { Role, ROLES } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { LoginAttemptOrmEntity } from '@modules/users/infra/database/entities/login-attempt.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import {
  UserTokenOrmEntity,
  UserTokenTypeColumn,
} from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { MailDeliveryError, MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { deleteLoginAttempts } from './support/login-attempts';
import { MemoryLogger } from './support/memory-logger';

const PASSWORD = 'senha-forte-1';
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;

const INVALID_TOKEN = {
  statusCode: 422,
  error: 'Unprocessable Entity',
  message: 'Link inválido, expirado ou já utilizado.',
  details: { field: 'token' },
};

interface TestClient {
  id: string;
  email: string;
  accessToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

describe('Verificação de e-mail do Client (integração)', () => {
  const env = envSchema.parse(process.env);
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

    // Em produção, os papéis são criados no SuperTokens pelo seed.
    await new SuperTokensIdentityProvider().createRoles(ROLES);
  });

  beforeEach(() => {
    mailSender.messages.length = 0;
  });

  afterAll(async () => {
    await deleteLoginAttempts(dataSource, emails);
    // O perfil e os tokens saem junto com o usuário (ON DELETE CASCADE).
    await dataSource?.getRepository(UserOrmEntity).delete({ id: In(createdIds) });
    await Promise.all(createdIds.map((id) => supertokens.deleteUser(id)));
    await dataSource?.destroy();
    await app?.close();
  });

  function send(method: string, path: string, body?: unknown, accessToken = ''): Promise<Response> {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Cadastra o Client pela rota do app, que é quem envia o primeiro link. */
  async function register(): Promise<{ response: Response; email: string }> {
    const email = `verify.${randomUUID()}@reportaai.invalid`;
    emails.push(email);
    const response = await send('POST', '/clients', {
      name: 'Maria da Silva',
      email,
      password: PASSWORD,
      cpf: randomCpf(),
      phone: '(43) 99999-8888',
      birthDate: '1990-05-20',
    });

    return { response, email };
  }

  function signIn(email: string): Promise<Response> {
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
          { id: 'password', value: PASSWORD },
        ],
      }),
    });
  }

  /** Cadastra o Client e faz login: a conta fica com o link do cadastro pendente. */
  async function createClient(): Promise<TestClient> {
    const { response, email } = await register();

    if (response.status !== 201) {
      throw new Error(`Cadastro falhou: ${response.status} ${await response.text()}`);
    }

    const { id } = (await response.json()) as { id: string };
    createdIds.push(id);
    const accessToken = (await signIn(email)).headers.get('st-access-token') ?? '';

    return { id, email, accessToken };
  }

  function confirm(token: string): Promise<Response> {
    return send('POST', '/email-verifications/confirm', { token });
  }

  function resend(accessToken: string): Promise<Response> {
    return send('POST', '/users/me/email-verification', undefined, accessToken);
  }

  /** O `emailVerifiedAt` que o app lê no perfil. */
  async function verifiedAtInProfile(accessToken: string): Promise<unknown> {
    const response = await send('GET', '/users/me', undefined, accessToken);
    const profile = (await response.json()) as { emailVerifiedAt: unknown };

    return profile.emailVerifiedAt;
  }

  /** Assuntos dos e-mails enviados ao endereço. */
  function subjectsSentTo(email: string): string[] {
    return mailSender.messages.filter(({ to }) => to === email).map(({ subject }) => subject);
  }

  /** Segredo do link de verificação do último e-mail enviado ao endereço. */
  function lastSecret(email: string): string {
    const message = mailSender.messages.findLast(
      ({ to, subject }) => to === email && subject === EMAIL_VERIFICATION_MAIL_SUBJECT,
    );
    const match = /\/verificar-email\?token=([\w-]+)/.exec(message?.text ?? '');

    if (!match) {
      throw new Error(`Nenhum link de verificação foi enviado para ${email}.`);
    }

    return match[1];
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
      expiresAt: new Date(Date.now() + HOUR_IN_MS),
    });
  }

  /** Recua a emissão dos tokens do usuário, como se o intervalo de um minuto tivesse passado. */
  async function passResendInterval(userId: string): Promise<void> {
    await dataSource
      .getRepository(UserTokenOrmEntity)
      .update({ userId }, { createdAt: new Date(Date.now() - MINUTE_IN_MS - 1000) });
  }

  describe('POST /api/clients', () => {
    it('deve cadastrar o Client com o e-mail não verificado e enviar o link, guardando só o hash (24 h)', async () => {
      const client = await createClient();

      const secret = lastSecret(client.email);
      expect(subjectsSentTo(client.email)).toEqual([EMAIL_VERIFICATION_MAIL_SUBJECT]);
      expect(mailSender.messages[0].text).toContain(
        `${env.WEB_APP_URL}/verificar-email?token=${secret}`,
      );
      const tokens = await findTokens(client.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        type: 'EMAIL_VERIFICATION',
        tokenHash: sha256(secret),
        usedAt: null,
      });
      expect(tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime()).toBe(
        env.EMAIL_VERIFICATION_EXPIRES_IN_HOURS * HOUR_IN_MS,
      );
      await expect(findUser(client.id)).resolves.toMatchObject({ emailVerifiedAt: null });
      // O login não depende da verificação (RN22).
      expect(client.accessToken).not.toBe('');
      await expect(verifiedAtInProfile(client.accessToken)).resolves.toBeNull();
    });

    it('deve responder 201 no mesmo formato quando o e-mail não é enviado, e o reenvio funciona', async () => {
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const { response, email } = await register();

      expect(response.status).toBe(201);
      const body = (await response.json()) as { id: string };
      createdIds.push(body.id);
      expect(body).toEqual({
        id: expect.any(String) as string,
        role: Role.CLIENT,
        name: 'Maria da Silva',
        email,
        status: 'ACTIVE',
        cpf: expect.stringMatching(/^\d{11}$/) as string,
        phone: '43999998888',
        birthDate: '1990-05-20',
        createdAt: expect.any(String) as string,
      });
      expect(mailSender.messages).toHaveLength(0);
      await expect(findTokens(body.id)).resolves.toHaveLength(1);

      const accessToken = (await signIn(email)).headers.get('st-access-token') ?? '';
      await passResendInterval(body.id);
      const resent = await resend(accessToken);

      expect(resent.status).toBe(204);
      await expect(confirm(lastSecret(email))).resolves.toHaveProperty('status', 204);
      await expect(verifiedAtInProfile(accessToken)).resolves.toEqual(expect.any(String));
    });
  });

  describe('POST /api/email-verifications/confirm', () => {
    it('deve preencher o email_verified_at sem sessão e marcar o token como usado', async () => {
      const client = await createClient();

      const response = await confirm(lastSecret(client.email));

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      const row = await findUser(client.id);
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);
      const [token] = await findTokens(client.id);
      expect(token.usedAt).toBeInstanceOf(Date);
      await expect(verifiedAtInProfile(client.accessToken)).resolves.toBe(
        row.emailVerifiedAt?.toISOString(),
      );
    });

    it('deve responder 422 para um token inexistente', async () => {
      const response = await confirm('token-que-nao-existe');

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
    });

    it('deve responder 422 para um token já usado, mantendo a data da verificação', async () => {
      const client = await createClient();
      const secret = lastSecret(client.email);
      await confirm(secret);
      const { emailVerifiedAt } = await findUser(client.id);

      const response = await confirm(secret);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
      await expect(findUser(client.id)).resolves.toMatchObject({ emailVerifiedAt });
    });

    it('deve responder 422 para um token expirado, sem verificar o e-mail', async () => {
      const client = await createClient();
      await dataSource
        .getRepository(UserTokenOrmEntity)
        .update({ userId: client.id }, { expiresAt: new Date(Date.now() - 1000) });

      const response = await confirm(lastSecret(client.email));

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
      await expect(findUser(client.id)).resolves.toMatchObject({ emailVerifiedAt: null });
    });

    it('deve responder 422 para o link substituído por um reenvio', async () => {
      const client = await createClient();
      const oldSecret = lastSecret(client.email);
      await passResendInterval(client.id);
      await resend(client.accessToken);
      const newSecret = lastSecret(client.email);

      const replaced = await confirm(oldSecret);

      expect(newSecret).not.toBe(oldSecret);
      expect(replaced.status).toBe(422);
      await expect(replaced.json()).resolves.toEqual(INVALID_TOKEN);
      await expect(findUser(client.id)).resolves.toMatchObject({ emailVerifiedAt: null });
      await expect(confirm(newSecret)).resolves.toHaveProperty('status', 204);
    });

    it.each(['INVITATION', 'PASSWORD_RESET'] as const)(
      'deve responder 422 para um token do tipo %s, sem verificar o e-mail nem consumi-lo',
      async (type) => {
        const client = await createClient();
        const secret = `segredo-${randomUUID()}`;
        await insertToken(client.id, type, secret);

        const response = await confirm(secret);

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
        await expect(findUser(client.id)).resolves.toMatchObject({ emailVerifiedAt: null });
        const tokens = await findTokens(client.id);
        expect(tokens.map(({ usedAt }) => usedAt)).toEqual([null, null]);
      },
    );

    it('deve responder 422 para o token de uma conta excluída', async () => {
      const client = await createClient();
      const secret = lastSecret(client.email);
      const deletion = await send(
        'DELETE',
        '/users/me',
        { password: PASSWORD },
        client.accessToken,
      );
      expect(deletion.status).toBe(204);

      const response = await confirm(secret);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_TOKEN);
      const row = await dataSource
        .getRepository(UserOrmEntity)
        .findOneOrFail({ where: { id: client.id }, withDeleted: true });
      expect(row.emailVerifiedAt).toBeNull();
    });

    it('deve confirmar o e-mail de uma conta inativada, que continua sem acesso', async () => {
      const client = await createClient();
      await dataSource
        .getRepository(UserOrmEntity)
        .update({ id: client.id }, { status: 'INACTIVE' });

      const response = await confirm(lastSecret(client.email));

      expect(response.status).toBe(204);
      const row = await findUser(client.id);
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);
      expect(row.status).toBe('INACTIVE');
    });

    it.each([
      ['ausente', {}],
      ['vazio', { token: '  ' }],
    ])('deve responder 400 para um token %s', async (_case, body) => {
      const response = await send('POST', '/email-verifications/confirm', body);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        details: [expect.objectContaining({ field: 'token' })],
      });
    });

    it('deve permitir confirmar de novo quando a gravação no MySQL falha', async () => {
      const client = await createClient();
      const secret = lastSecret(client.email);
      jest
        .spyOn(app.get(UserRepository), 'saveWithToken')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));

      const failed = await confirm(secret);

      expect(failed.status).toBe(500);
      const [token] = await findTokens(client.id);
      expect(token.usedAt).toBeNull();
      await expect(findUser(client.id)).resolves.toMatchObject({ emailVerifiedAt: null });
      await expect(confirm(secret)).resolves.toHaveProperty('status', 204);
    });
  });

  describe('POST /api/users/me/email-verification', () => {
    it('deve reenviar o link para quem ainda não verificou, no lugar do anterior', async () => {
      const client = await createClient();
      const oldSecret = lastSecret(client.email);
      await passResendInterval(client.id);

      const response = await resend(client.accessToken);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      expect(subjectsSentTo(client.email)).toEqual([
        EMAIL_VERIFICATION_MAIL_SUBJECT,
        EMAIL_VERIFICATION_MAIL_SUBJECT,
      ]);
      const newSecret = lastSecret(client.email);
      const tokens = await findTokens(client.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenHash).toBe(sha256(newSecret));
      expect(tokens[0].tokenHash).not.toBe(sha256(oldSecret));
    });

    it('deve responder 422 a menos de 1 minuto do último e-mail, mantendo o link', async () => {
      const client = await createClient();
      const secret = lastSecret(client.email);

      const response = await resend(client.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Um e-mail acabou de ser enviado. Aguarde um minuto para pedir outro.',
      });
      expect(mailSender.messages).toHaveLength(1);
      await expect(confirm(secret)).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 422 para quem já verificou o e-mail, sem enviar outro link', async () => {
      const client = await createClient();
      await confirm(lastSecret(client.email));
      await passResendInterval(client.id);

      const response = await resend(client.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'O e-mail desta conta já foi verificado.',
      });
      expect(mailSender.messages).toHaveLength(1);
    });

    it('deve responder 204 quando o envio do e-mail falha, e o reenvio seguinte funciona', async () => {
      const client = await createClient();
      await passResendInterval(client.id);
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const failed = await resend(client.accessToken);

      expect(failed.status).toBe(204);
      expect(mailSender.messages).toHaveLength(1);
      await passResendInterval(client.id);
      await expect(resend(client.accessToken)).resolves.toHaveProperty('status', 204);
      await expect(confirm(lastSecret(client.email))).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 401 sem sessão', async () => {
      const response = await resend('');

      expect(response.status).toBe(401);
      expect(mailSender.messages).toHaveLength(0);
    });
  });

  describe('Token fora do banco e do log', () => {
    it('nunca deve gravar o token puro em user_tokens nem escrevê-lo no log', async () => {
      const client = await createClient();
      const secret = lastSecret(client.email);
      // Um 500 no meio da confirmação é o caminho que mais escreve no log.
      jest
        .spyOn(app.get(UserRepository), 'saveWithToken')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));
      await confirm(secret);
      await confirm(secret);
      await confirm(secret);

      const rows = await dataSource.query<Record<string, unknown>[]>(
        'SELECT * FROM user_tokens WHERE user_id = ?',
        [client.id],
      );
      const log = logger.lines.join('\n');
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect(log).toContain('Falha no MySQL.');
      expect(log).not.toContain(secret);
    });
  });
});
