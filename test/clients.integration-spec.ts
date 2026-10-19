import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertokens from 'supertokens-node';
import UserRoles from 'supertokens-node/recipe/userroles';
import { DataSource, In } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { UserRepository } from '@modules/users/domain/repositories/user.repository';
import { Role, ROLES } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { MailSender } from '@shared/application/ports/mail-sender';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { deleteLoginAttempts } from './support/login-attempts';

const TENANT_ID = 'public';
const PASSWORD = 'senha-forte-1';

/** Gera um CPF válido, para cada teste ter o seu. */
function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (const length of [9, 10]) {
    const sum = digits.reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    digits.push(((sum * 10) % 11) % 10);
  }

  return digits.join('');
}

function formatCpf(cpf: string): string {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

describe('Autocadastro de Client (integração)', () => {
  const env = envSchema.parse(process.env);
  // O cadastro envia o link de verificação de e-mail (test/email-verification.integration-spec.ts).
  const mailSender = new FakeMailSender();
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(mailSender)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    // Em produção, os papéis são criados no SuperTokens pelo seed.
    await new SuperTokensIdentityProvider().createRoles(ROLES);
  });

  afterAll(async () => {
    const users = await Promise.all(
      emails.map((email) => supertokens.listUsersByAccountInfo(TENANT_ID, { email })),
    );
    const ids = users.flat().map((user) => user.id);
    // O client_profiles é removido junto (ON DELETE CASCADE).
    await dataSource?.getRepository(UserOrmEntity).delete({ email: In(emails) });
    await Promise.all(ids.map((id) => supertokens.deleteUser(id)));
    await deleteLoginAttempts(dataSource, emails);
    await dataSource?.destroy();
    await app?.close();
  });

  function buildBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const email = `client.${randomUUID()}@reportaai.invalid`;
    emails.push(email);

    return {
      name: 'Maria da Silva',
      email,
      password: PASSWORD,
      cpf: formatCpf(randomCpf()),
      phone: '(43) 99999-8888',
      birthDate: '1990-05-20',
      ...overrides,
    };
  }

  function register(body: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function credentialsFor(email: unknown): Promise<unknown[]> {
    return supertokens.listUsersByAccountInfo(TENANT_ID, { email: String(email) });
  }

  it('deve cadastrar o Client sem sessão e responder 201 com o perfil, sem a senha', async () => {
    const body = buildBody();

    const response = await register(body);

    expect(response.status).toBe(201);
    const profile = (await response.json()) as Record<string, unknown>;
    expect(profile).toEqual({
      id: expect.any(String) as string,
      role: Role.CLIENT,
      name: 'Maria da Silva',
      email: body.email,
      status: 'ACTIVE',
      cpf: String(body.cpf).replace(/\D/g, ''),
      phone: '43999998888',
      birthDate: '1990-05-20',
      createdAt: expect.any(String) as string,
    });
    expect(JSON.stringify(profile)).not.toContain(PASSWORD);
  });

  it('deve gravar users e client_profiles com o id do SuperTokens e o papel CLIENT', async () => {
    const body = buildBody();

    const { id } = (await (await register(body)).json()) as { id: string };

    await expect(
      dataSource.getRepository(UserOrmEntity).findOneByOrFail({ id }),
    ).resolves.toMatchObject({
      roleId: ROLE_IDS[Role.CLIENT],
      status: 'ACTIVE',
      email: body.email,
    });
    await expect(
      dataSource.getRepository(ClientProfileOrmEntity).findOneByOrFail({ userId: id }),
    ).resolves.toMatchObject({
      cpf: String(body.cpf).replace(/\D/g, ''),
      phone: '43999998888',
      birthDate: '1990-05-20',
    });
    await expect(UserRoles.getRolesForUser(TENANT_ID, id)).resolves.toMatchObject({
      roles: [Role.CLIENT],
    });
  });

  it('deve permitir o login logo depois do cadastro', async () => {
    const body = buildBody();
    await register(body);

    const response = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        rid: 'emailpassword',
        'st-auth-mode': 'header',
      },
      body: JSON.stringify({
        formFields: [
          { id: 'email', value: body.email },
          { id: 'password', value: PASSWORD },
        ],
      }),
    });

    await expect(response.json()).resolves.toMatchObject({ status: 'OK' });
    expect(response.headers.get('st-access-token')).toEqual(expect.any(String));
  });

  it('deve responder 409 para um e-mail já cadastrado, sem criar outra credencial (RN02)', async () => {
    const first = buildBody();
    await register(first);

    const response = await register(
      buildBody({ email: String(first.email).toUpperCase(), cpf: randomCpf() }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'E-mail já cadastrado.',
      details: { field: 'email' },
    });
    await expect(credentialsFor(first.email)).resolves.toHaveLength(1);
  });

  it('deve responder 409 para um CPF já cadastrado, sem criar a credencial (RN07)', async () => {
    const first = buildBody();
    await register(first);
    const second = buildBody({ cpf: String(first.cpf).replace(/\D/g, '') });

    const response = await register(second);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      message: 'CPF já cadastrado.',
      details: { field: 'cpf' },
    });
    await expect(credentialsFor(second.email)).resolves.toEqual([]);
  });

  it('deve responder 400 com todos os campos inválidos, sem criar a credencial', async () => {
    const body = buildBody({ password: 'somenteletras', cpf: '123.456.789-00', birthDate: '' });

    const response = await register(body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Dados inválidos.',
      details: [
        { field: 'password', message: 'A senha deve ter pelo menos uma letra e um número.' },
        { field: 'cpf', message: 'CPF inválido.' },
        {
          field: 'birthDate',
          message: 'Data de nascimento inválida. Use o formato AAAA-MM-DD.',
        },
      ],
    });
    await expect(credentialsFor(body.email)).resolves.toEqual([]);
  });

  it('não deve deixar credencial órfã no SuperTokens quando a gravação no MySQL falha', async () => {
    const body = buildBody();
    jest
      .spyOn(app.get(UserRepository), 'saveClient')
      .mockRejectedValueOnce(new Error('Falha no MySQL.'));

    const response = await register(body);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ message: 'Erro interno do servidor.' });
    await expect(credentialsFor(body.email)).resolves.toEqual([]);
    expect(mailSender.messages.filter(({ to }) => to === body.email)).toEqual([]);
  });
});
