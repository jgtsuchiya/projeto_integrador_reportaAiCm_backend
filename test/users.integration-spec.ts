import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { DataSource, EntityManager, QueryRunner } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

const CLIENT_ROLE_ID = 3;

describe('Tabelas de usuários (integração)', () => {
  const env = envSchema.parse(process.env);
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let manager: EntityManager;

  beforeAll(async () => {
    // Proteção: os testes de integração alteram o schema; nunca rode contra o banco de desenvolvimento.
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
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  // Cada teste roda numa transação desfeita no final, para não deixar dados no banco.
  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();
    manager = queryRunner.manager;
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  function buildUser(overrides: Partial<UserOrmEntity> = {}): UserOrmEntity {
    return manager.create(UserOrmEntity, {
      id: randomUUID(),
      roleId: CLIENT_ROLE_ID,
      name: 'Maria da Silva',
      email: `maria.${randomUUID()}@example.com`,
      status: 'ACTIVE',
      ...overrides,
    });
  }

  function buildClientProfile(
    userId: string,
    overrides: Partial<ClientProfileOrmEntity> = {},
  ): ClientProfileOrmEntity {
    return manager.create(ClientProfileOrmEntity, {
      userId,
      cpf: '52998224725',
      phone: '43999998888',
      birthDate: '1990-05-20',
      ...overrides,
    });
  }

  function buildUserToken(
    userId: string,
    overrides: Partial<UserTokenOrmEntity> = {},
  ): UserTokenOrmEntity {
    return manager.create(UserTokenOrmEntity, {
      id: randomUUID(),
      userId,
      type: 'INVITATION',
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      ...overrides,
    });
  }

  it('deve carregar os papéis SUPER_ADMIN, ADMIN e CLIENT', async () => {
    const roles = await manager.find(RoleOrmEntity, { order: { id: 'ASC' } });

    expect(roles).toEqual([
      { id: 1, code: 'SUPER_ADMIN', name: 'Super administrador' },
      { id: 2, code: 'ADMIN', name: 'Administrador' },
      { id: 3, code: 'CLIENT', name: 'Cidadão' },
    ]);
  });

  it('deve persistir um usuário com os valores padrão das colunas', async () => {
    const user = buildUser();

    await manager.save(user);
    const saved = await manager.findOneByOrFail(UserOrmEntity, { id: user.id });

    expect(saved).toMatchObject({
      roleId: CLIENT_ROLE_ID,
      status: 'ACTIVE',
      mfaEnabled: false,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdById: null,
      deletedAt: null,
    });
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('deve persistir o perfil do Client e o token de convite ligados ao usuário', async () => {
    const user = await manager.save(buildUser());

    await manager.save(buildClientProfile(user.id));
    await manager.save(buildUserToken(user.id));

    await expect(
      manager.findOneByOrFail(ClientProfileOrmEntity, { userId: user.id }),
    ).resolves.toMatchObject({ cpf: '52998224725', birthDate: '1990-05-20' });
    await expect(manager.countBy(UserTokenOrmEntity, { userId: user.id })).resolves.toBe(1);
  });

  it('deve recusar dois usuários com o mesmo e-mail', async () => {
    await manager.insert(UserOrmEntity, buildUser({ email: 'repetido@example.com' }));

    await expect(
      manager.insert(UserOrmEntity, buildUser({ email: 'repetido@example.com' })),
    ).rejects.toMatchObject({ driverError: { code: 'ER_DUP_ENTRY' } });
  });

  it('deve recusar um usuário com role_id inexistente', async () => {
    await expect(manager.insert(UserOrmEntity, buildUser({ roleId: 99 }))).rejects.toMatchObject({
      driverError: { code: 'ER_NO_REFERENCED_ROW_2' },
    });
  });

  it('deve recusar um status fora do enum', async () => {
    const user = buildUser();

    await expect(
      manager.query('INSERT INTO users (id, role_id, name, email, status) VALUES (?, ?, ?, ?, ?)', [
        user.id,
        user.roleId,
        user.name,
        user.email,
        'BLOCKED',
      ]),
    ).rejects.toMatchObject({ driverError: { code: 'WARN_DATA_TRUNCATED' } });
  });

  it('deve recusar um perfil de Client sem usuário', async () => {
    await expect(
      manager.insert(ClientProfileOrmEntity, buildClientProfile(randomUUID())),
    ).rejects.toMatchObject({ driverError: { code: 'ER_NO_REFERENCED_ROW_2' } });
  });

  it('deve recusar dois perfis de Client com o mesmo CPF', async () => {
    const first = await manager.save(buildUser());
    const second = await manager.save(buildUser());
    await manager.insert(ClientProfileOrmEntity, buildClientProfile(first.id));

    await expect(
      manager.insert(ClientProfileOrmEntity, buildClientProfile(second.id)),
    ).rejects.toMatchObject({ driverError: { code: 'ER_DUP_ENTRY' } });
  });

  it('deve recusar dois tokens com o mesmo hash', async () => {
    const user = await manager.save(buildUser());
    await manager.insert(UserTokenOrmEntity, buildUserToken(user.id));

    await expect(manager.insert(UserTokenOrmEntity, buildUserToken(user.id))).rejects.toMatchObject(
      { driverError: { code: 'ER_DUP_ENTRY' } },
    );
  });

  it('deve recusar um created_by_id que não é de um usuário', async () => {
    await expect(
      manager.insert(UserOrmEntity, buildUser({ createdById: randomUUID() })),
    ).rejects.toMatchObject({ driverError: { code: 'ER_NO_REFERENCED_ROW_2' } });
  });
});
