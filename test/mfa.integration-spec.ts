import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { LOGIN_CODE_MAIL_SUBJECT } from '@modules/users/application/services/login-code.service';
import { UserRepository } from '@modules/users/domain/repositories/user.repository';
import { Email } from '@modules/users/domain/value-objects/email';
import { Password } from '@modules/users/domain/value-objects/password';
import { Role } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { LoginAttemptOrmEntity } from '@modules/users/infra/database/entities/login-attempt.orm-entity';
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
import { MemoryLogger } from './support/memory-logger';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';
const MINUTE_IN_MS = 60 * 1000;

/** 403 do SuperTokens para a sessão que ainda não conferiu o código da segunda etapa. */
const PENDING_SECOND_FACTOR = {
  message: 'invalid claim',
  claimValidationErrors: [
    {
      id: 'mfa-verified',
      reason: { message: 'wrong value', expectedValue: true, actualValue: false },
    },
  ],
};

const INVALID_CODE = {
  statusCode: 422,
  error: 'Unprocessable Entity',
  message: 'Código inválido ou expirado.',
  details: { field: 'code' },
};

const NOT_PENDING = {
  statusCode: 422,
  error: 'Unprocessable Entity',
  message: 'Esta sessão não tem uma verificação em duas etapas pendente.',
};

const RECENTLY_SENT = {
  statusCode: 422,
  error: 'Unprocessable Entity',
  message: 'Um e-mail acabou de ser enviado. Aguarde um minuto para pedir outro.',
};

interface TestUser {
  id: string;
  email: string;
}

/** Sessão aberta por um login no modo header, como o app mobile recebe. */
interface TestSession {
  accessToken: string;
  refreshToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A claim da segunda etapa vai no payload do access token, que é um JWT. */
function readSecondFactorClaim(accessToken: string): boolean | undefined {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as {
    'mfa-verified'?: { v: boolean };
  };

  return payload['mfa-verified']?.v;
}

/** A mesma claim, no header `front-token`, de onde os SDKs de front leem o payload da sessão. */
function readFrontTokenClaim(response: Response): boolean | undefined {
  const frontToken = JSON.parse(
    Buffer.from(response.headers.get('front-token') ?? '', 'base64').toString(),
  ) as { up: { 'mfa-verified'?: { v: boolean } } };

  return frontToken.up['mfa-verified']?.v;
}

/** Um código de 6 dígitos diferente do informado. */
function otherCode(code: string): string {
  return code === '000000' ? '000001' : '000000';
}

describe('Segunda etapa do login por código (integração)', () => {
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

  /**
   * Cria a credencial no SuperTokens e o usuário ACTIVE no MySQL, com o mesmo id. A verificação
   * em duas etapas é ligada direto no banco, para estes testes não dependerem da rota de
   * ativação, que tem os próprios testes no `profile.integration-spec.ts`. O usuário é um ADMIN
   * porque o perfil dele (`GET /api/users/me`) não depende de outra tabela.
   */
  async function createUser({ mfa }: { mfa: boolean }): Promise<TestUser> {
    const email = Email.create(`mfa.${randomUUID()}@reportaai.invalid`);
    emails.push(email.value);
    const id = await identityProvider.createCredentials(email, Password.create(PASSWORD));
    createdIds.push(id);
    await dataSource.getRepository(UserOrmEntity).insert({
      id,
      roleId: ROLE_IDS[Role.ADMIN],
      name: 'Usuário de teste',
      email: email.value,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      mfaEnabled: mfa,
    });

    return { id, email: email.value };
  }

  function signInRequest(user: TestUser, authMode: 'header' | 'cookie'): Promise<Response> {
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

  /** Abre uma sessão pelo login. Com a verificação em duas etapas ativa, ela nasce pendente. */
  async function signIn(user: TestUser): Promise<TestSession> {
    const response = await signInRequest(user, 'header');
    const accessToken = response.headers.get('st-access-token');
    const refreshToken = response.headers.get('st-refresh-token');

    if (!accessToken || !refreshToken) {
      throw new Error(`Login falhou: ${response.status} ${await response.text()}`);
    }

    return { accessToken, refreshToken };
  }

  function refresh(refreshToken: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/session/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshToken}`, 'st-auth-mode': 'header' },
    });
  }

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

  function verify(code: unknown, accessToken?: string): Promise<Response> {
    return send('POST', '/mfa/verify', { code }, accessToken);
  }

  function resend(accessToken?: string): Promise<Response> {
    return send('POST', '/mfa/code', undefined, accessToken);
  }

  function profile(accessToken: string): Promise<Response> {
    return send('GET', '/users/me', undefined, accessToken);
  }

  /** E-mails com o código enviados ao endereço. */
  function codeMailsSentTo(email: string): string[] {
    return mailSender.messages
      .filter(({ to, subject }) => to === email && subject === LOGIN_CODE_MAIL_SUBJECT)
      .map(({ text }) => text);
  }

  /** Código do último e-mail enviado ao endereço: fica sozinho numa linha do texto. */
  function lastCode(email: string): string {
    const match = /^\d{6}$/m.exec(codeMailsSentTo(email).at(-1) ?? '');

    if (!match) {
      throw new Error(`Nenhum código foi enviado para ${email}.`);
    }

    return match[0];
  }

  function findUser(id: string): Promise<UserOrmEntity> {
    return dataSource.getRepository(UserOrmEntity).findOneByOrFail({ id });
  }

  function findCodes(userId: string): Promise<UserTokenOrmEntity[]> {
    return dataSource.getRepository(UserTokenOrmEntity).findBy({ userId, type: 'LOGIN_CODE' });
  }

  /** Troca o código vigente do usuário por um escolhido pelo teste (o login sorteia). */
  async function setCode(userId: string, code: string): Promise<void> {
    await dataSource
      .getRepository(UserTokenOrmEntity)
      .update({ userId, type: 'LOGIN_CODE' }, { tokenHash: sha256(`${userId}:${code}`) });
  }

  /** Recua a emissão do código do usuário, como se o intervalo de um minuto tivesse passado. */
  async function passResendInterval(userId: string): Promise<void> {
    await dataSource
      .getRepository(UserTokenOrmEntity)
      .update({ userId }, { createdAt: new Date(Date.now() - MINUTE_IN_MS - 1000) });
  }

  describe('POST /api/auth/signin', () => {
    it('não deve mudar o login de quem não tem a verificação em duas etapas', async () => {
      const user = await createUser({ mfa: false });

      const response = await signInRequest(user, 'header');

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
      const accessToken = response.headers.get('st-access-token') ?? '';
      expect(readSecondFactorClaim(accessToken)).toBe(true);
      expect(mailSender.messages).toHaveLength(0);
      await expect(findCodes(user.id)).resolves.toHaveLength(0);
      await expect(profile(accessToken)).resolves.toHaveProperty('status', 200);
      await expect(findUser(user.id)).resolves.toMatchObject({
        lastLoginAt: expect.any(Date) as Date,
      });
    });

    it('deve abrir uma sessão pendente e enviar o código, guardando só o hash (RN25)', async () => {
      const user = await createUser({ mfa: true });

      const response = await signInRequest(user, 'header');

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
      expect(readSecondFactorClaim(response.headers.get('st-access-token') ?? '')).toBe(false);
      expect(response.headers.get('st-refresh-token')).toEqual(expect.any(String));
      expect(codeMailsSentTo(user.email)).toHaveLength(1);
      const code = lastCode(user.email);
      const codes = await findCodes(user.id);
      expect(codes).toHaveLength(1);
      expect(codes[0]).toMatchObject({
        tokenHash: sha256(`${user.id}:${code}`),
        attempts: 0,
        usedAt: null,
      });
      expect(codes[0].expiresAt.getTime() - codes[0].createdAt.getTime()).toBe(
        env.MFA_CODE_EXPIRES_IN_MINUTES * MINUTE_IN_MS,
      );
      // O login só é concluído quando o código é conferido.
      await expect(findUser(user.id)).resolves.toMatchObject({ lastLoginAt: null });
    });

    it('deve responder 403 "invalid claim" à sessão pendente nas rotas autenticadas', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);

      const responses = await Promise.all([
        profile(session.accessToken),
        send('PATCH', '/users/me', { name: 'Outro Nome' }, session.accessToken),
        send('GET', '/users/me/sessions', undefined, session.accessToken),
        send('DELETE', '/users/me/sessions', undefined, session.accessToken),
        send('POST', '/users/me/email-verification', undefined, session.accessToken),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual(PENDING_SECOND_FACTOR);
      }
      await expect(findUser(user.id)).resolves.toMatchObject({ name: 'Usuário de teste' });
    });

    it('deve manter o código enviado há menos de 1 minuto num login novo, sem enviar outro', async () => {
      const user = await createUser({ mfa: true });
      await signIn(user);
      const code = lastCode(user.email);

      const second = await signIn(user);

      expect(readSecondFactorClaim(second.accessToken)).toBe(false);
      expect(codeMailsSentTo(user.email)).toHaveLength(1);
      await expect(verify(code, second.accessToken)).resolves.toHaveProperty('status', 204);
    });

    it('deve enviar um código novo no login seguinte ao uso do anterior', async () => {
      const user = await createUser({ mfa: true });
      const first = await signIn(user);
      const firstCode = lastCode(user.email);
      await verify(firstCode, first.accessToken);

      const second = await signIn(user);

      expect(codeMailsSentTo(user.email)).toHaveLength(2);
      const codes = await findCodes(user.id);
      expect(codes).toHaveLength(1);
      expect(codes[0].usedAt).toBeNull();
      await expect(verify(lastCode(user.email), second.accessToken)).resolves.toHaveProperty(
        'status',
        204,
      );
    });

    it('deve abrir a sessão pendente mesmo quando o envio do código falha', async () => {
      const user = await createUser({ mfa: true });
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const session = await signIn(user);

      expect(readSecondFactorClaim(session.accessToken)).toBe(false);
      expect(mailSender.messages).toHaveLength(0);
      // Depois do intervalo, o reenvio entrega um código que conclui o login.
      await passResendInterval(user.id);
      await expect(resend(session.accessToken)).resolves.toHaveProperty('status', 204);
      await expect(verify(lastCode(user.email), session.accessToken)).resolves.toHaveProperty(
        'status',
        204,
      );
    });
  });

  describe('POST /api/mfa/verify', () => {
    it('deve concluir o login com o código certo e devolver o access token atualizado (RN25)', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);

      const response = await verify(lastCode(user.email), session.accessToken);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      const accessToken = response.headers.get('st-access-token') ?? '';
      expect(readSecondFactorClaim(accessToken)).toBe(true);
      const me = await profile(accessToken);
      expect(me.status).toBe(200);
      await expect(me.json()).resolves.toMatchObject({
        id: user.id,
        lastLoginAt: expect.any(String) as string,
      });
      const codes = await findCodes(user.id);
      expect(codes).toHaveLength(1);
      expect(codes[0].usedAt).toBeInstanceOf(Date);
    });

    it('deve atualizar os cookies da sessão no modo cookie, como o painel web usa', async () => {
      const user = await createUser({ mfa: true });
      const signedIn = await signInRequest(user, 'cookie');
      const cookie = signedIn.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const pending = await fetch(`${baseUrl}/api/users/me`, { headers: { cookie } });

      const response = await fetch(`${baseUrl}/api/mfa/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ code: lastCode(user.email) }),
      });

      expect(pending.status).toBe(403);
      expect(response.status).toBe(204);
      const accessTokenCookie = response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .find((value) => value.startsWith('sAccessToken='));
      expect(accessTokenCookie).toEqual(expect.any(String));
      // O painel não lê o cookie httpOnly: o SDK dele lê a claim do header front-token.
      expect(readFrontTokenClaim(response)).toBe(true);
      expect(readFrontTokenClaim(signedIn)).toBe(false);
      const me = await fetch(`${baseUrl}/api/users/me`, {
        headers: { cookie: accessTokenCookie ?? '' },
      });
      expect(me.status).toBe(200);
    });

    it('deve continuar recusando o access token antigo, que ainda diz que a sessão está pendente', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      await verify(lastCode(user.email), session.accessToken);

      const response = await profile(session.accessToken);

      // O token é conferido pela assinatura: por isso o atualizado volta na resposta do verify.
      expect(response.status).toBe(403);
    });

    it('deve responder 422 ao código errado, contar o erro e manter a sessão pendente', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      const code = lastCode(user.email);

      const response = await verify(otherCode(code), session.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_CODE);
      expect(response.headers.get('st-access-token')).toBeNull();
      await expect(profile(session.accessToken)).resolves.toHaveProperty('status', 403);
      await expect(findCodes(user.id)).resolves.toEqual([
        expect.objectContaining({ attempts: 1, usedAt: null }),
      ]);
      await expect(findUser(user.id)).resolves.toMatchObject({ lastLoginAt: null });
      // O código certo ainda entra depois de um erro.
      await expect(verify(code, session.accessToken)).resolves.toHaveProperty('status', 204);
    });

    it('deve invalidar o código no 5º erro, até um código novo ser enviado', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      const code = lastCode(user.email);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await verify(otherCode(code), session.accessToken);
      }

      const exhausted = await verify(code, session.accessToken);

      expect(exhausted.status).toBe(422);
      await expect(exhausted.json()).resolves.toEqual(INVALID_CODE);
      await expect(findCodes(user.id)).resolves.toEqual([
        expect.objectContaining({ attempts: 5, usedAt: null }),
      ]);
      await passResendInterval(user.id);
      await resend(session.accessToken);
      await expect(verify(lastCode(user.email), session.accessToken)).resolves.toHaveProperty(
        'status',
        204,
      );
    });

    it('deve contar todos os erros de conferências simultâneas e parar no limite', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      const code = lastCode(user.email);

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => verify(otherCode(code), session.accessToken)),
      );

      expect(responses.map(({ status }) => status)).toEqual(Array(20).fill(422));
      await expect(findCodes(user.id)).resolves.toEqual([
        expect.objectContaining({ attempts: 5, usedAt: null }),
      ]);
      await expect(verify(code, session.accessToken)).resolves.toHaveProperty('status', 422);
    });

    it('não deve aceitar de novo um código já usado', async () => {
      const user = await createUser({ mfa: true });
      const first = await signIn(user);
      // O login seguinte, em menos de 1 minuto, espera o mesmo código.
      const second = await signIn(user);
      const code = lastCode(user.email);
      await verify(code, first.accessToken);

      const response = await verify(code, second.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_CODE);
      await expect(profile(second.accessToken)).resolves.toHaveProperty('status', 403);
    });

    it('deve aceitar o código uma única vez em conferências simultâneas', async () => {
      const user = await createUser({ mfa: true });
      // Três logins em menos de 1 minuto esperam o mesmo código.
      const sessions = [await signIn(user), await signIn(user), await signIn(user)];
      const code = lastCode(user.email);

      const responses = await Promise.all(
        sessions.map(({ accessToken }) => verify(code, accessToken)),
      );

      expect(codeMailsSentTo(user.email)).toHaveLength(1);
      expect(responses.map(({ status }) => status).sort()).toEqual([204, 422, 422]);
    });

    it('não deve aceitar o código de outra conta', async () => {
      const user = await createUser({ mfa: true });
      const other = await createUser({ mfa: true });
      const session = await signIn(user);
      const otherSession = await signIn(other);
      // O sorteio poderia dar o mesmo código às duas contas: o da outra é trocado por um diferente.
      const otherAccountCode = otherCode(lastCode(user.email));
      await setCode(other.id, otherAccountCode);

      const response = await verify(otherAccountCode, session.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_CODE);
      await expect(findCodes(user.id)).resolves.toEqual([
        expect.objectContaining({ attempts: 1, usedAt: null }),
      ]);
      await expect(findCodes(other.id)).resolves.toEqual([
        expect.objectContaining({ attempts: 0, usedAt: null }),
      ]);
      // Na conta dona dele, o código vale.
      await expect(verify(otherAccountCode, otherSession.accessToken)).resolves.toHaveProperty(
        'status',
        204,
      );
    });

    it('deve aceitar o mesmo código em duas contas, cada um na sua', async () => {
      const user = await createUser({ mfa: true });
      const other = await createUser({ mfa: true });
      const session = await signIn(user);
      const otherSession = await signIn(other);
      await setCode(user.id, '246810');
      await setCode(other.id, '246810');

      const responses = await Promise.all([
        verify('246810', session.accessToken),
        verify('246810', otherSession.accessToken),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([204, 204]);
    });

    it('deve responder 422 ao código expirado', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      await dataSource
        .getRepository(UserTokenOrmEntity)
        .update({ userId: user.id }, { expiresAt: new Date(Date.now() - 1000) });

      const response = await verify(lastCode(user.email), session.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(INVALID_CODE);
      await expect(findCodes(user.id)).resolves.toEqual([
        expect.objectContaining({ attempts: 0, usedAt: null }),
      ]);
    });

    it.each([
      ['com 5 dígitos', '12345'],
      ['com letras', '12a456'],
      ['numérico', 123456],
      ['ausente', undefined],
    ])('deve responder 400 ao código %s, sem contar erro', async (_case, code) => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);

      const response = await verify(code, session.accessToken);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        statusCode: 400,
        message: 'Dados inválidos.',
        details: [expect.objectContaining({ field: 'code' })],
      });
      await expect(findCodes(user.id)).resolves.toEqual([expect.objectContaining({ attempts: 0 })]);
    });

    it('deve responder 422 à sessão que já concluiu a segunda etapa, sem gastar o código de outra', async () => {
      const user = await createUser({ mfa: true });
      const first = await signIn(user);
      const completed = await verify(lastCode(user.email), first.accessToken);
      const accessToken = completed.headers.get('st-access-token') ?? '';
      const second = await signIn(user);
      const code = lastCode(user.email);

      const response = await verify(code, accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(NOT_PENDING);
      await expect(verify(code, second.accessToken)).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 422 à sessão de quem não tem a verificação em duas etapas', async () => {
      const user = await createUser({ mfa: false });
      const session = await signIn(user);

      const response = await verify('123456', session.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(NOT_PENDING);
    });

    it('deve responder 401 sem sessão', async () => {
      const response = await verify('123456');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/mfa/code', () => {
    it('deve enviar um código novo, que invalida o anterior (RN25)', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      await verify(otherCode(lastCode(user.email)), session.accessToken);
      const [old] = await findCodes(user.id);
      await passResendInterval(user.id);

      const response = await resend(session.accessToken);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      expect(codeMailsSentTo(user.email)).toHaveLength(2);
      const newCode = lastCode(user.email);
      const codes = await findCodes(user.id);
      // O código anterior saiu do banco, e o novo começa sem erros.
      expect(old.attempts).toBe(1);
      expect(codes).toHaveLength(1);
      expect(codes[0].id).not.toBe(old.id);
      expect(codes[0]).toMatchObject({ tokenHash: sha256(`${user.id}:${newCode}`), attempts: 0 });
      // A sessão continua pendente até o código novo ser conferido.
      await expect(profile(session.accessToken)).resolves.toHaveProperty('status', 403);
      await expect(verify(newCode, session.accessToken)).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 422 a menos de 1 minuto do último código, mantendo o código', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      const code = lastCode(user.email);

      const response = await resend(session.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(RECENTLY_SENT);
      expect(codeMailsSentTo(user.email)).toHaveLength(1);
      await expect(verify(code, session.accessToken)).resolves.toHaveProperty('status', 204);
    });

    it('deve responder 204 e manter o código gravado quando o envio do e-mail falha', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      await passResendInterval(user.id);
      jest.spyOn(mailSender, 'send').mockRejectedValueOnce(new MailDeliveryError());

      const response = await resend(session.accessToken);

      expect(response.status).toBe(204);
      expect(codeMailsSentTo(user.email)).toHaveLength(1);
      await expect(findCodes(user.id)).resolves.toHaveLength(1);
    });

    it('deve responder 422 à sessão completa, sem enviar e-mail', async () => {
      const user = await createUser({ mfa: false });
      const session = await signIn(user);

      const response = await resend(session.accessToken);

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(NOT_PENDING);
      expect(mailSender.messages).toHaveLength(0);
    });

    it('deve responder 401 sem sessão', async () => {
      const response = await resend();

      expect(response.status).toBe(401);
      expect(mailSender.messages).toHaveLength(0);
    });
  });

  describe('Refresh e signout com a sessão pendente', () => {
    it('deve renovar a sessão pendente, que continua pendente', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);

      const response = await refresh(session.refreshToken);

      expect(response.status).toBe(200);
      const accessToken = response.headers.get('st-access-token') ?? '';
      expect(readSecondFactorClaim(accessToken)).toBe(false);
      await expect(profile(accessToken)).resolves.toHaveProperty('status', 403);
      await expect(verify(lastCode(user.email), accessToken)).resolves.toHaveProperty(
        'status',
        204,
      );
    });

    it('deve manter a sessão completa depois de renovada', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      const completed = await verify(lastCode(user.email), session.accessToken);
      const refreshToken = completed.headers.get('st-refresh-token') ?? session.refreshToken;

      const response = await refresh(refreshToken);

      expect(response.status).toBe(200);
      const accessToken = response.headers.get('st-access-token') ?? '';
      expect(readSecondFactorClaim(accessToken)).toBe(true);
      await expect(profile(accessToken)).resolves.toHaveProperty('status', 200);
    });

    it('deve encerrar a sessão pendente no signout', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);

      const response = await fetch(`${baseUrl}/api/auth/signout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.accessToken}` },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'OK' });
      await expect(refresh(session.refreshToken)).resolves.toHaveProperty('status', 401);
    });
  });

  describe('Sessões abertas antes da segunda etapa', () => {
    it('deve continuar aceitando a sessão sem a claim, mesmo de quem tem a verificação em duas etapas', async () => {
      const user = await createUser({ mfa: true });
      // Como as sessões abertas antes da claim: criada fora do login, sem a claim no token.
      const old = await Session.createNewSessionWithoutRequestResponse(
        TENANT_ID,
        supertokens.convertToRecipeUserId(user.id),
      );
      const accessToken = old.getAccessToken();

      const response = await profile(accessToken);

      expect(readSecondFactorClaim(accessToken)).toBeUndefined();
      expect(response.status).toBe(200);
      // Ela não está pendente: as rotas da segunda etapa a recusam.
      const verification = await verify('123456', accessToken);
      expect(verification.status).toBe(422);
      await expect(verification.json()).resolves.toEqual(NOT_PENDING);
    });
  });

  describe('Código fora do banco e do log', () => {
    it('nunca deve gravar o código em user_tokens nem escrevê-lo no log', async () => {
      const user = await createUser({ mfa: true });
      const session = await signIn(user);
      const code = lastCode(user.email);
      await verify(otherCode(code), session.accessToken);
      // Um 500 no meio da conferência é o caminho que mais escreve no log.
      jest
        .spyOn(app.get(UserRepository), 'save')
        .mockRejectedValueOnce(new Error('Falha no MySQL.'));
      const failed = await verify(code, session.accessToken);

      const rows = await dataSource.query<Record<string, unknown>[]>(
        'SELECT * FROM user_tokens WHERE user_id = ?',
        [user.id],
      );
      const log = logger.lines.join('\n');
      expect(failed.status).toBe(500);
      expect(rows).toHaveLength(1);
      // Nenhuma coluna guarda o código: a `token_hash` tem o SHA-256 dele com o id do usuário.
      expect(Object.values(rows[0])).not.toContain(code);
      expect(rows[0]).toMatchObject({ token_hash: sha256(`${user.id}:${code}`) });
      expect(log).toContain('Falha no MySQL.');
      expect(log).not.toContain(code);
    });
  });
});
