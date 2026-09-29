import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import supertokens from 'supertokens-node';
import UserRoles from 'supertokens-node/recipe/userroles';
import { DataSource, QueryRunner } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { buildSuperTokensConfig } from '@modules/auth/infra/supertokens/supertokens.config';
import { CreateSuperAdminUseCase } from '@modules/users/application/use-cases/create-super-admin.use-case';
import { Email } from '@modules/users/domain/value-objects/email';
import { Role, ROLES } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { ROLE_IDS } from '@modules/users/infra/database/mappers/user.mapper';
import { TypeOrmUserRepository } from '@modules/users/infra/database/repositories/typeorm-user.repository';
import { SuperTokensIdentityProvider } from '@modules/users/infra/identity/supertokens-identity-provider';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

describe('Seed do SuperAdm (integração)', () => {
  const env = envSchema.parse(process.env);
  const identityProvider = new SuperTokensIdentityProvider();
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let users: TypeOrmUserRepository;
  let sut: CreateSuperAdminUseCase;
  let email: string;

  beforeAll(async () => {
    // Proteção: os testes de integração alteram o schema; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    // Os hooks só são usados pelas rotas nativas do SuperTokens, que este teste não chama.
    supertokens.init(
      buildSuperTokensConfig(env, {
        authorizeSignIn: async () => true,
        checkPasswordPolicy: async () => null,
      }),
    );
    dataSource = new DataSource({
      ...buildDataSourceOptions(env),
      entities: [RoleOrmEntity, UserOrmEntity, ClientProfileOrmEntity, UserTokenOrmEntity],
      migrations: [
        join(__dirname, '..', 'src', 'shared', 'infra', 'database', 'migrations', '*.ts'),
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  // No MySQL, cada teste roda numa transação desfeita no final. No SuperTokens, o usuário
  // criado é removido.
  beforeEach(async () => {
    email = `super.${randomUUID()}@reportaai.invalid`;
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();
    users = new TypeOrmUserRepository(queryRunner.manager.getRepository(UserOrmEntity));
    sut = new CreateSuperAdminUseCase(users, identityProvider);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();

    const created = await supertokens.listUsersByAccountInfo('public', { email });
    await Promise.all(created.map((user) => supertokens.deleteUser(user.id)));
  });

  function execute(): ReturnType<CreateSuperAdminUseCase['execute']> {
    return sut.execute({ name: 'Super Admin', email, password: 'SuperAdmin123' });
  }

  it('deve criar um único SuperAdm no MySQL e no SuperTokens, mesmo rodando duas vezes', async () => {
    const first = await execute();
    const second = await execute();

    expect(first).toEqual({ created: true, userId: expect.any(String) as string });
    expect(second).toEqual({ created: false });

    const rows = await queryRunner.manager.findBy(UserOrmEntity, {
      roleId: ROLE_IDS[Role.SUPER_ADMIN],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email, status: 'ACTIVE', createdById: null });
    expect(rows[0].emailVerifiedAt).toBeInstanceOf(Date);

    const credentials = await supertokens.listUsersByAccountInfo('public', { email });
    expect(credentials.map((user) => user.id)).toEqual([rows[0].id]);
    await expect(
      identityProvider.verifyPassword(Email.create(email), 'SuperAdmin123'),
    ).resolves.toBe(true);
    await expect(UserRoles.getRolesForUser('public', rows[0].id)).resolves.toMatchObject({
      roles: [Role.SUPER_ADMIN],
    });
  });

  it('deve criar os papéis no SuperTokens', async () => {
    await execute();

    const { roles } = await UserRoles.getAllRoles();
    expect(roles).toEqual(expect.arrayContaining([...ROLES]));
  });

  it('deve remover a credencial do SuperTokens quando a gravação no MySQL falha', async () => {
    jest.spyOn(users, 'save').mockRejectedValue(new Error('Falha no MySQL.'));

    await expect(execute()).rejects.toThrow('Falha no MySQL.');

    await expect(supertokens.listUsersByAccountInfo('public', { email })).resolves.toEqual([]);
  });
});
