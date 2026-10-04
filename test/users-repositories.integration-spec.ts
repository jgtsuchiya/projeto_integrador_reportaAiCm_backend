import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { DataSource, QueryRunner } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { ClientProfile } from '@modules/users/domain/entities/client-profile.entity';
import { UserToken } from '@modules/users/domain/entities/user-token.entity';
import { User } from '@modules/users/domain/entities/user.entity';
import { CpfAlreadyInUseError } from '@modules/users/domain/errors/cpf-already-in-use.error';
import { EmailAlreadyInUseError } from '@modules/users/domain/errors/email-already-in-use.error';
import { BirthDate } from '@modules/users/domain/value-objects/birth-date';
import { Cpf } from '@modules/users/domain/value-objects/cpf';
import { Email } from '@modules/users/domain/value-objects/email';
import { Phone } from '@modules/users/domain/value-objects/phone';
import { Role } from '@modules/users/domain/value-objects/role';
import { UserStatus } from '@modules/users/domain/value-objects/user-status';
import { UserTokenType } from '@modules/users/domain/value-objects/user-token-type';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { TypeOrmClientProfileRepository } from '@modules/users/infra/database/repositories/typeorm-client-profile.repository';
import { TypeOrmUserTokenRepository } from '@modules/users/infra/database/repositories/typeorm-user-token.repository';
import { TypeOrmUserRepository } from '@modules/users/infra/database/repositories/typeorm-user.repository';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

describe('Repositórios de usuários (integração)', () => {
  const env = envSchema.parse(process.env);
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let users: TypeOrmUserRepository;
  let profiles: TypeOrmClientProfileRepository;
  let tokens: TypeOrmUserTokenRepository;

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
    users = new TypeOrmUserRepository(queryRunner.manager.getRepository(UserOrmEntity));
    profiles = new TypeOrmClientProfileRepository(
      queryRunner.manager.getRepository(ClientProfileOrmEntity),
    );
    tokens = new TypeOrmUserTokenRepository(queryRunner.manager.getRepository(UserTokenOrmEntity));
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  function buildClient(email = `maria.${randomUUID()}@example.com`): User {
    return User.createClient({
      id: randomUUID(),
      name: 'Maria da Silva',
      email: Email.create(email),
    });
  }

  describe('TypeOrmUserRepository', () => {
    it('deve salvar e buscar o usuário por id e por e-mail', async () => {
      const user = buildClient();

      await users.save(user);

      const byId = await users.findById(user.id);
      const byEmail = await users.findByEmail(user.email);
      expect(byId?.equals(user)).toBe(true);
      expect(byEmail?.equals(user)).toBe(true);
      expect(byId).toMatchObject({
        role: Role.CLIENT,
        name: user.name,
        status: user.status,
        createdAt: user.createdAt,
      });
    });

    it('deve retornar null para um usuário inexistente', async () => {
      await expect(users.findById(randomUUID())).resolves.toBeNull();
      await expect(users.findByEmail(Email.create('ninguem@example.com'))).resolves.toBeNull();
    });

    it('deve gravar as alterações de um usuário existente', async () => {
      const admin = User.createAdmin({
        id: randomUUID(),
        name: 'Admin Fulano',
        email: Email.create(`admin.${randomUUID()}@example.com`),
        createdById: (await saved(buildSuperAdminLike())).id,
      });
      await users.save(admin);

      admin.acceptInvitation();
      admin.rename('Admin Beltrano');
      await users.save(admin);

      await expect(users.findById(admin.id)).resolves.toMatchObject({
        name: 'Admin Beltrano',
        status: 'ACTIVE',
        emailVerifiedAt: admin.emailVerifiedAt,
        createdById: admin.createdById,
      });
    });

    it('deve informar se o e-mail e o papel já existem', async () => {
      const user = await saved(buildClient());

      await expect(users.existsByEmail(user.email)).resolves.toBe(true);
      await expect(users.existsByEmail(Email.create('ninguem@example.com'))).resolves.toBe(false);
      await expect(users.existsByRole(Role.CLIENT)).resolves.toBe(true);
    });

    it('deve gravar a exclusão lógica, esconder o usuário e liberar o e-mail (RN11)', async () => {
      const user = await saved(buildClient());
      const originalEmail = user.email;

      user.delete();
      await users.save(user);

      await expect(users.findById(user.id)).resolves.toBeNull();
      await expect(users.existsByEmail(originalEmail)).resolves.toBe(false);
      await expect(saved(buildClient(originalEmail.value))).resolves.toBeInstanceOf(User);

      const row = await queryRunner.manager.findOne(UserOrmEntity, {
        where: { id: user.id },
        withDeleted: true,
      });
      expect(row).toMatchObject({
        name: user.name,
        email: `deleted+${user.id}@reportaai.invalid`,
        deletedAt: user.deletedAt,
      });
    });

    describe('findPage', () => {
      // Datas no futuro: os ADMINs do teste ficam no topo da lista, antes de outros do banco.
      async function savedAdmin(
        createdAt: string,
        status: UserStatus = UserStatus.PENDING,
      ): Promise<User> {
        const superAdmin = await saved(buildSuperAdminLike());
        const date = new Date(createdAt);

        return saved(
          User.restore(randomUUID(), {
            role: Role.ADMIN,
            name: 'Admin Fulano',
            email: Email.create(`admin.${randomUUID()}@example.com`),
            status,
            emailVerifiedAt: null,
            mfaEnabled: false,
            lastLoginAt: null,
            createdById: superAdmin.id,
            createdAt: date,
            updatedAt: date,
            deletedAt: null,
          }),
        );
      }

      it('deve listar só o papel pedido, dos mais recentes para os mais antigos, paginado', async () => {
        const older = await savedAdmin('2999-01-01T00:00:00.000Z');
        const newer = await savedAdmin('2999-01-02T00:00:00.000Z');
        const newest = await savedAdmin('2999-01-03T00:00:00.000Z');

        const first = await users.findPage({ role: Role.ADMIN }, { page: 1, pageSize: 2 });
        const second = await users.findPage({ role: Role.ADMIN }, { page: 2, pageSize: 2 });

        expect(first.items.map(({ id }) => id)).toEqual([newest.id, newer.id]);
        expect(second.items[0].id).toBe(older.id);
        expect(first.total).toBeGreaterThanOrEqual(3);
        expect(first).toMatchObject({ page: 1, pageSize: 2 });
        expect(first.items.every((user) => user.role === Role.ADMIN)).toBe(true);
      });

      it('deve filtrar pelo status e ignorar os excluídos', async () => {
        const inactive = await savedAdmin('2999-02-01T00:00:00.000Z', UserStatus.INACTIVE);
        const deleted = await savedAdmin('2999-02-02T00:00:00.000Z', UserStatus.INACTIVE);
        deleted.delete();
        await users.save(deleted);

        const result = await users.findPage(
          { role: Role.ADMIN, status: UserStatus.INACTIVE },
          { page: 1, pageSize: 100 },
        );

        expect(result.items[0].id).toBe(inactive.id);
        expect(result.items.map(({ id }) => id)).not.toContain(deleted.id);
        expect(result.items.every((user) => user.status === UserStatus.INACTIVE)).toBe(true);
      });
    });

    describe('findClientPage', () => {
      // Datas no futuro: os CLIENTs do teste ficam no topo da lista, antes de outros do banco.
      async function savedClient(
        createdAt: string,
        {
          name = 'Maria da Silva',
          cpf = randomCpf(),
          status = UserStatus.ACTIVE,
        }: { name?: string; cpf?: string; status?: UserStatus } = {},
      ): Promise<User> {
        const date = new Date(createdAt);
        const user = User.restore(randomUUID(), {
          role: Role.CLIENT,
          name,
          email: Email.create(`client.${randomUUID()}@example.com`),
          status,
          emailVerifiedAt: null,
          mfaEnabled: false,
          lastLoginAt: null,
          createdById: null,
          createdAt: date,
          updatedAt: date,
          deletedAt: null,
        });
        await users.saveClient(user, buildProfile(user.id, cpf));

        return user;
      }

      it('deve listar só os CLIENTs com o perfil, dos mais recentes para os mais antigos, paginado', async () => {
        const cpf = randomCpf();
        const older = await savedClient('2999-03-01T00:00:00.000Z');
        const newer = await savedClient('2999-03-02T00:00:00.000Z', { cpf });
        const newest = await savedClient('2999-03-03T00:00:00.000Z');
        await savedAdminLike('2999-03-04T00:00:00.000Z');

        const first = await users.findClientPage({}, { page: 1, pageSize: 2 });
        const second = await users.findClientPage({}, { page: 2, pageSize: 2 });

        expect(first.items.map(({ user }) => user.id)).toEqual([newest.id, newer.id]);
        expect(second.items[0].user.id).toBe(older.id);
        expect(first.total).toBeGreaterThanOrEqual(3);
        expect(first).toMatchObject({ page: 1, pageSize: 2 });
        expect(first.items.every(({ user }) => user.role === Role.CLIENT)).toBe(true);
        expect(first.items[1].profile).toMatchObject({
          userId: newer.id,
          cpf: Cpf.create(cpf),
          phone: Phone.create('43999998888'),
          birthDate: BirthDate.create('1990-05-20'),
        });
      });

      it('deve filtrar pelo status e ignorar os excluídos', async () => {
        const inactive = await savedClient('2999-04-01T00:00:00.000Z', {
          status: UserStatus.INACTIVE,
        });
        const deleted = await savedClient('2999-04-02T00:00:00.000Z', {
          status: UserStatus.INACTIVE,
        });
        deleted.delete();
        await users.save(deleted);

        const result = await users.findClientPage(
          { status: UserStatus.INACTIVE },
          { page: 1, pageSize: 100 },
        );

        expect(result.items[0].user.id).toBe(inactive.id);
        expect(result.items.map(({ user }) => user.id)).not.toContain(deleted.id);
        expect(result.items.every(({ user }) => user.status === UserStatus.INACTIVE)).toBe(true);
      });

      it('deve buscar um trecho do nome, sem diferenciar maiúsculas e acentos, ou do e-mail', async () => {
        const tag = randomUUID().slice(0, 8);
        const client = await savedClient('2999-05-01T00:00:00.000Z', {
          name: `José Conceição ${tag}`,
        });
        await savedClient('2999-05-02T00:00:00.000Z', { name: 'Outra Pessoa' });

        const byName = await users.findClientPage(
          { text: `conceicao ${tag.toUpperCase()}` },
          { page: 1, pageSize: 100 },
        );
        const byEmail = await users.findClientPage(
          { text: client.email.value.slice(0, 20) },
          { page: 1, pageSize: 100 },
        );

        expect(byName.items.map(({ user }) => user.id)).toEqual([client.id]);
        expect(byName.total).toBe(1);
        expect(byEmail.items.map(({ user }) => user.id)).toEqual([client.id]);
      });

      it('deve tratar os curingas do LIKE como texto', async () => {
        await savedClient('2999-06-01T00:00:00.000Z');

        const result = await users.findClientPage({ text: '%' }, { page: 1, pageSize: 100 });

        expect(result).toMatchObject({ items: [], total: 0 });
      });

      it('deve buscar pelo CPF exato', async () => {
        const cpf = randomCpf();
        const client = await savedClient('2999-07-01T00:00:00.000Z', { cpf });
        await savedClient('2999-07-02T00:00:00.000Z');

        const result = await users.findClientPage(
          { cpf: Cpf.create(cpf) },
          { page: 1, pageSize: 100 },
        );

        expect(result.items.map(({ user }) => user.id)).toEqual([client.id]);
        expect(result.total).toBe(1);
      });
    });

    describe('saveClient', () => {
      it('deve gravar o usuário e o perfil do Client', async () => {
        const user = buildClient();

        await users.saveClient(user, buildProfile(user.id));

        await expect(users.findById(user.id)).resolves.toMatchObject({ role: Role.CLIENT });
        await expect(profiles.findByUserId(user.id)).resolves.toMatchObject({
          cpf: Cpf.create('52998224725'),
        });
      });

      it('deve desfazer o usuário quando o perfil falha e converter o CPF repetido em conflito', async () => {
        const first = buildClient();
        await users.saveClient(first, buildProfile(first.id));
        const second = buildClient();

        await expect(users.saveClient(second, buildProfile(second.id))).rejects.toThrow(
          CpfAlreadyInUseError,
        );

        await expect(users.findById(second.id)).resolves.toBeNull();
      });

      it('deve converter o e-mail repetido em conflito', async () => {
        const first = buildClient();
        await users.saveClient(first, buildProfile(first.id));
        const second = buildClient(first.email.value);

        await expect(
          users.saveClient(second, buildProfile(second.id, '111.444.777-35')),
        ).rejects.toThrow(EmailAlreadyInUseError);
      });
    });
  });

  describe('TypeOrmUserTokenRepository', () => {
    it('deve remover todos os tokens do usuário e manter os dos outros', async () => {
      const superAdmin = await saved(buildSuperAdminLike());
      const issue = (userId: string): UserToken =>
        UserToken.issue({ userId, type: UserTokenType.INVITATION, validForHours: 48 }).token;
      const token = issue(superAdmin.id);
      const other = issue((await saved(buildClient())).id);
      await tokens.replace(token);
      await tokens.replace(other);

      await tokens.deleteByUserId(superAdmin.id);

      await expect(tokens.findByHash(token.tokenHash)).resolves.toBeNull();
      await expect(tokens.findByHash(other.tokenHash)).resolves.not.toBeNull();
    });
  });

  describe('TypeOrmClientProfileRepository', () => {
    it('deve salvar, buscar e atualizar o perfil do Client', async () => {
      const user = await saved(buildClient());
      const profile = buildProfile(user.id);
      await profiles.save(profile);

      profile.changePhone(Phone.create('4332221111'));
      await profiles.save(profile);

      const found = await profiles.findByUserId(user.id);
      expect(found?.cpf.value).toBe('52998224725');
      expect(found?.phone.value).toBe('4332221111');
      expect(found?.birthDate.value).toBe('1990-05-20');
    });

    it('deve informar se o CPF já existe', async () => {
      const user = await saved(buildClient());
      await profiles.save(buildProfile(user.id));

      await expect(profiles.existsByCpf(Cpf.create('52998224725'))).resolves.toBe(true);
      await expect(profiles.existsByCpf(Cpf.create('11144477735'))).resolves.toBe(false);
    });

    it('deve remover o perfil', async () => {
      const user = await saved(buildClient());
      await profiles.save(buildProfile(user.id));

      await profiles.delete(user.id);

      await expect(profiles.findByUserId(user.id)).resolves.toBeNull();
      await expect(profiles.existsByCpf(Cpf.create('52998224725'))).resolves.toBe(false);
    });
  });

  function buildProfile(userId: string, cpf = '529.982.247-25'): ClientProfile {
    return ClientProfile.create({
      userId,
      cpf: Cpf.create(cpf),
      phone: Phone.create('(43) 99999-8888'),
      birthDate: BirthDate.create('1990-05-20'),
    });
  }

  /** Gera um CPF válido, para cada CLIENT do teste ter o seu (o CPF é UNIQUE). */
  function randomCpf(): string {
    const digits = Array.from({ length: 9 }, () => randomInt(10));
    for (const length of [9, 10]) {
      const sum = digits.reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
      digits.push(((sum * 10) % 11) % 10);
    }

    return digits.join('');
  }

  async function savedAdminLike(createdAt: string): Promise<User> {
    const superAdmin = await saved(buildSuperAdminLike());
    const date = new Date(createdAt);

    return saved(
      User.restore(randomUUID(), {
        role: Role.ADMIN,
        name: 'Admin Fulano',
        email: Email.create(`admin.${randomUUID()}@example.com`),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        mfaEnabled: false,
        lastLoginAt: null,
        createdById: superAdmin.id,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
      }),
    );
  }

  function buildSuperAdminLike(): User {
    return User.createSuperAdmin({
      id: randomUUID(),
      name: 'Super Admin',
      email: Email.create(`super.${randomUUID()}@example.com`),
    });
  }

  async function saved(user: User): Promise<User> {
    await users.save(user);

    return user;
  }
});
