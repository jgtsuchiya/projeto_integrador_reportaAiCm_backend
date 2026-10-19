import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import request from 'supertest';
import { DataSource, In, IsNull, Not } from 'typeorm';

import { Env, envSchema } from '@config/env.schema';
import { LOGIN_CODE_MAIL_SUBJECT } from '@modules/users/application/services/login-code.service';
import {
  CreateSuperAdminInput,
  CreateSuperAdminOutput,
  CreateSuperAdminUseCase,
} from '@modules/users/application/use-cases/create-super-admin.use-case';
import { USER_TOKEN_RESEND_INTERVAL_MINUTES } from '@modules/users/domain/entities/user-token.entity';
import { LoginAttemptOrmEntity } from '@modules/users/infra/database/entities/login-attempt.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { BackgroundTasks } from '@shared/application/ports/background-tasks';
import { MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

/** Senha das contas criadas pelos helpers. Segue a política da RN08. */
export const PASSWORD = 'senha-forte-1';

/** Tokens de uma sessão no modo header, como o app mobile recebe. */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface Account {
  id: string;
  email: string;
  password: string;
}

/** Conta com uma sessão aberta. */
export interface Actor extends Account, Tokens {}

/** ADMIN convidado (PENDING), com o token do link que foi no e-mail. */
export interface InvitedAdmin {
  id: string;
  email: string;
  token: string;
}

/** Corpo do `POST /api/clients`. */
export interface ClientPayload {
  name: string;
  email: string;
  password: string;
  cpf: string;
  phone: string;
  birthDate: string;
}

/** E-mail único, para as contas de um teste não colidirem com as de outro. */
export function newEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@reportaai.invalid`;
}

/** Gera um CPF válido, para cada Client ter o seu. */
export function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (const length of [9, 10]) {
    const sum = digits.reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    digits.push(((sum * 10) % 11) % 10);
  }

  return digits.join('');
}

export function buildClientPayload(): ClientPayload {
  return {
    name: 'Maria da Silva',
    email: newEmail('client'),
    password: PASSWORD,
    cpf: randomCpf(),
    phone: '(43) 99999-8888',
    birthDate: '1990-05-20',
  };
}

/** Tokens que as rotas de sessão do SuperTokens devolvem nos headers, no modo header. */
export function readTokens(response: request.Response): Tokens {
  return {
    accessToken: response.get('st-access-token') ?? '',
    refreshToken: response.get('st-refresh-token') ?? '',
  };
}

/** Páginas do painel web que recebem o token dos links enviados por e-mail. */
export type LinkPage = '/convite' | '/redefinir-senha' | '/verificar-email';

/**
 * A API de pé para os testes e2e (`test/*.e2e-spec.ts`), contra o MySQL de teste e o
 * SuperTokens Core, com o `FakeMailSender` no lugar do SMTP. As requisições são feitas com o
 * supertest, e o login, no modo header (`st-auth-mode: header`).
 *
 * Cada arquivo de teste parte do banco sem usuários e sem tentativas de login: o `start` e o
 * `close` apagam todos eles.
 * As contas são criadas pelos mesmos caminhos da aplicação (seed, convite e autocadastro).
 */
export class E2eApp {
  private constructor(
    private readonly app: INestApplication<Server>,
    private readonly dataSource: DataSource,
    /** Guarda os e-mails que a API enviaria. */
    readonly mailSender: FakeMailSender,
  ) {}

  static async start(): Promise<E2eApp> {
    const env = envSchema.parse(process.env);

    // Proteção: os testes gravam no banco; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    await runMigrations(env);

    const mailSender = new FakeMailSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(mailSender)
      .compile();
    const app = moduleRef.createNestApplication<INestApplication<Server>>({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    const e2e = new E2eApp(app, app.get(DataSource), mailSender);

    try {
      await e2e.clearData();
    } catch (error) {
      await app.close();
      throw error;
    }

    return e2e;
  }

  async close(): Promise<void> {
    try {
      // Um pedido de redefinição de senha ainda em andamento gravaria depois da limpeza.
      await this.waitForBackgroundTasks();
      await this.clearData();
    } finally {
      await this.app.close();
    }
  }

  /** Requisição do supertest à API. Os caminhos incluem o prefixo `/api`. */
  api(): ReturnType<typeof request> {
    return request(this.app.getHttpServer());
  }

  /** Login pela rota nativa do SuperTokens, no modo header. */
  signIn(email: string, password: string): request.Test {
    return this.api()
      .post('/api/auth/signin')
      .set({ rid: 'emailpassword', 'st-auth-mode': 'header' })
      .send({
        formFields: [
          { id: 'email', value: email },
          { id: 'password', value: password },
        ],
      });
  }

  /** Renova a sessão: o refresh token vai no lugar do access token. */
  refresh(refreshToken: string): request.Test {
    return this.api()
      .post('/api/auth/session/refresh')
      .set('st-auth-mode', 'header')
      .auth(refreshToken, { type: 'bearer' });
  }

  /**
   * Espera o trabalho que a API continua depois de responder. É o caso do pedido de
   * redefinição de senha, que responde 204 antes de buscar a conta e de enviar o e-mail.
   */
  waitForBackgroundTasks(): Promise<void> {
    return this.app.get(BackgroundTasks).drain();
  }

  /** Abre uma sessão nova para a conta. */
  async logIn(account: Account): Promise<Actor> {
    const response = await this.signIn(account.email, account.password);
    const tokens = readTokens(response);

    if (!tokens.accessToken) {
      throw new Error(`Login falhou: ${response.status} ${response.text}`);
    }

    return { ...account, ...tokens };
  }

  /**
   * Abre uma sessão pendente: a senha já foi conferida, e o código da segunda etapa ainda não
   * (RN25). A verificação em duas etapas fica ligada só durante o login, direto no banco, para
   * os outros logins da conta continuarem completos. A rota de ativação não serve aqui: ela
   * exige o e-mail verificado, que o Client não tem, e revoga as outras sessões da conta.
   */
  async logInPending(account: Account): Promise<Actor> {
    const repository = this.dataSource.getRepository(UserOrmEntity);
    await repository.update({ id: account.id }, { mfaEnabled: true });

    try {
      return await this.logIn(account);
    } finally {
      await repository.update({ id: account.id }, { mfaEnabled: false });
    }
  }

  /**
   * Código da segunda etapa do último e-mail enviado ao endereço. Um login feito menos de um
   * minuto depois de outro não envia um código novo: vale o do e-mail anterior.
   */
  lastLoginCode(email: string): string {
    const message = this.mailSender.messages.findLast(
      ({ to, subject }) => to === email && subject === LOGIN_CODE_MAIL_SUBJECT,
    );
    const match = /^\d{6}$/m.exec(message?.text ?? '');

    if (!match) {
      throw new Error(`Nenhum código da segunda etapa foi enviado para ${email}.`);
    }

    return match[0];
  }

  /**
   * Token do link para a página do painel, no último e-mail enviado ao endereço com esse link.
   * O token só existe no e-mail: o banco guarda o hash dele.
   */
  lastLinkToken(email: string, page: LinkPage): string {
    const pattern = new RegExp(`${page}\\?token=([\\w-]+)`);
    const match = this.mailSender.messages
      .filter(({ to }) => to === email)
      .map(({ text }) => pattern.exec(text))
      .findLast((result) => result !== null);

    if (!match) {
      throw new Error(`Nenhum link para ${page} foi enviado para ${email}.`);
    }

    return match[1];
  }

  /** Id da sessão dos tokens, como o `GET /api/users/me/sessions` a identifica. */
  async currentSessionId(tokens: Tokens): Promise<string> {
    const response = await this.api()
      .get('/api/users/me/sessions')
      .auth(tokens.accessToken, { type: 'bearer' });
    assertStatus(response, 200, 'Listagem das sessões');

    const sessions = response.body as Array<{ id: string; current: boolean }>;
    const current = sessions.find((session) => session.current);

    if (!current) {
      throw new Error('A sessão dos tokens não está entre as sessões abertas.');
    }

    return current.id;
  }

  /** Roda o caso de uso do seed (`npm run seed`), que também cria os papéis no SuperTokens. */
  runSeed(input: CreateSuperAdminInput): Promise<CreateSuperAdminOutput> {
    return this.app.get(CreateSuperAdminUseCase).execute(input);
  }

  /** Cadastra o SuperAdm pelo seed e faz login. */
  async seedSuperAdmin(): Promise<Actor> {
    const account = { email: newEmail('super'), password: PASSWORD };
    const result = await this.runSeed({ name: 'Super Admin', ...account });

    if (!result.created) {
      throw new Error('O seed não criou o SuperAdm: já existe um no banco de teste.');
    }

    return this.logIn({ id: result.userId, ...account });
  }

  /** Convida um ADMIN pelo SuperAdm. O ADMIN fica PENDING até aceitar o convite. */
  async inviteAdmin(superAdmin: Tokens): Promise<InvitedAdmin> {
    const email = newEmail('admin');
    const response = await this.api()
      .post('/api/admins')
      .auth(superAdmin.accessToken, { type: 'bearer' })
      .send({ name: 'Ana Souza', email });
    assertStatus(response, 201, 'Convite');

    return {
      id: (response.body as { id: string }).id,
      email,
      token: this.lastLinkToken(email, '/convite'),
    };
  }

  /** Convida um ADMIN, aceita o convite e faz login. */
  async createAdmin(superAdmin: Tokens): Promise<Actor> {
    const { id, email, token } = await this.inviteAdmin(superAdmin);
    const response = await this.api()
      .post('/api/invitations/accept')
      .send({ token, password: PASSWORD });
    assertStatus(response, 204, 'Aceite do convite');

    return this.logIn({ id, email, password: PASSWORD });
  }

  /** Cadastra um Client pela rota do app e faz login. */
  async registerClient(): Promise<Actor> {
    const payload = buildClientPayload();
    const response = await this.api().post('/api/clients').send(payload);
    assertStatus(response, 201, 'Cadastro do Client');

    return this.logIn({
      id: (response.body as { id: string }).id,
      email: payload.email,
      password: payload.password,
    });
  }

  /**
   * Cadastra um Client com a verificação em duas etapas ativa, pelos caminhos da aplicação:
   * cadastro, confirmação do e-mail pelo link (a ativação exige o e-mail verificado) e
   * `PATCH /api/users/me/mfa`. A sessão devolvida é a que ativou, que continua completa
   * (RN24). Os logins seguintes abrem sessões pendentes.
   */
  async registerClientWithMfa(): Promise<Actor> {
    const client = await this.registerClient();
    const verification = await this.api()
      .post('/api/email-verifications/confirm')
      .send({ token: this.lastLinkToken(client.email, '/verificar-email') });
    assertStatus(verification, 204, 'Confirmação do e-mail');

    const activation = await this.api()
      .patch('/api/users/me/mfa')
      .auth(client.accessToken, { type: 'bearer' })
      .send({ enabled: true, password: client.password });
    assertStatus(activation, 200, 'Ativação da verificação em duas etapas');

    return client;
  }

  /**
   * Recua a emissão dos tokens do usuário, como se o intervalo mínimo entre dois e-mails do
   * mesmo tipo já tivesse passado. Sem isso, o reenvio logo depois do cadastro responde 422.
   */
  async passResendInterval(userId: string): Promise<void> {
    const elapsedMs = (USER_TOKEN_RESEND_INTERVAL_MINUTES * 60 + 1) * 1000;

    await this.dataSource
      .getRepository(UserTokenOrmEntity)
      .update({ userId }, { createdAt: new Date(Date.now() - elapsedMs) });
  }

  /**
   * Apaga todos os usuários do banco de teste, as tentativas de login e as credenciais deles
   * no SuperTokens. O Core é o mesmo do ambiente de dev, então só saem dele os ids encontrados
   * no banco de teste.
   */
  private async clearData(): Promise<void> {
    // As tentativas de login não têm FK para users, então saem à parte.
    await this.dataSource.getRepository(LoginAttemptOrmEntity).deleteAll();

    const repository = this.dataSource.getRepository(UserOrmEntity);
    const users = await repository.find({ select: { id: true }, withDeleted: true });
    const ids = users.map(({ id }) => id);

    if (ids.length === 0) {
      return;
    }

    // Os ADMINs referenciam o SuperAdm (created_by_id), então saem primeiro. O perfil do
    // Client e os tokens saem junto com o usuário (ON DELETE CASCADE).
    await repository.delete({ id: In(ids), createdById: Not(IsNull()) });
    await repository.delete({ id: In(ids) });
    await Promise.all(ids.map((id) => supertokens.deleteUser(id)));
  }
}

async function runMigrations(env: Env): Promise<void> {
  const dataSource = new DataSource({
    ...buildDataSourceOptions(env),
    migrations: [
      join(__dirname, '..', '..', 'src', 'shared', 'infra', 'database', 'migrations', '*.ts'),
    ],
  });
  await dataSource.initialize();

  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

/** Falha na preparação com a resposta da API, em vez de o erro aparecer só mais adiante. */
function assertStatus(response: request.Response, status: number, step: string): void {
  if (response.status !== status) {
    throw new Error(`${step} falhou: ${response.status} ${response.text}`);
  }
}
