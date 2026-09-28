import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { DataSource, QueryRunner } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { ClientProfile } from '@modules/users/domain/entities/client-profile.entity';
import { User } from '@modules/users/domain/entities/user.entity';
import { CpfAlreadyInUseError } from '@modules/users/domain/errors/cpf-already-in-use.error';
import { EmailAlreadyInUseError } from '@modules/users/domain/errors/email-already-in-use.error';
import { BirthDate } from '@modules/users/domain/value-objects/birth-date';
import { Cpf } from '@modules/users/domain/value-objects/cpf';
import { Email } from '@modules/users/domain/value-objects/email';
import { Phone } from '@modules/users/domain/value-objects/phone';
import { Role } from '@modules/users/domain/value-objects/role';
import { ClientProfileOrmEntity } from '@modules/users/infra/database/entities/client-profile.orm-entity';
import { RoleOrmEntity } from '@modules/users/infra/database/entities/role.orm-entity';
import { UserTokenOrmEntity } from '@modules/users/infra/database/entities/user-token.orm-entity';
import { UserOrmEntity } from '@modules/users/infra/database/entities/user.orm-entity';
import { TypeOrmClientProfileRepository } from '@modules/users/infra/database/repositories/typeorm-client-profile.repository';
import { TypeOrmUserRepository } from '@modules/users/infra/database/repositories/typeorm-user.repository';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

describe('Repositórios de usuários (integração)', () => {
  const env = envSchema.parse(process.env);
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let users: TypeOrmUserRepository;
  let profiles: TypeOrmClientProfileRepository;

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
