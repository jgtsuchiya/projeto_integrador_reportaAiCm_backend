import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabelas de usuários (docs/sprints/sprint-2-usuarios.md, seção 3).
 * As credenciais e sessões ficam no SuperTokens, então não há coluna de senha.
 * Os papéis são dados de referência e são carregados aqui mesmo.
 */
export class CreateUsersTables1790554645270 implements MigrationInterface {
  name = 'CreateUsersTables1790554645270';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`roles\` (
        \`id\` smallint UNSIGNED NOT NULL,
        \`code\` varchar(30) NOT NULL,
        \`name\` varchar(60) NOT NULL,
        UNIQUE INDEX \`uq_roles_code\` (\`code\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`roles\` (\`id\`, \`code\`, \`name\`) VALUES
        (1, 'SUPER_ADMIN', 'Super administrador'),
        (2, 'ADMIN', 'Administrador'),
        (3, 'CLIENT', 'Cidadão')`,
    );

    await queryRunner.query(
      `CREATE TABLE \`users\` (
        \`id\` char(36) NOT NULL,
        \`role_id\` smallint UNSIGNED NOT NULL,
        \`name\` varchar(120) NOT NULL,
        \`email\` varchar(254) NOT NULL,
        \`status\` enum ('PENDING', 'ACTIVE', 'INACTIVE') NOT NULL,
        \`email_verified_at\` datetime(3) NULL,
        \`mfa_enabled\` tinyint NOT NULL DEFAULT 0,
        \`last_login_at\` datetime(3) NULL,
        \`created_by_id\` char(36) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` datetime(3) NULL,
        INDEX \`idx_users_role_id\` (\`role_id\`),
        INDEX \`idx_users_created_by_id\` (\`created_by_id\`),
        UNIQUE INDEX \`uq_users_email\` (\`email\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_users_role_id\` FOREIGN KEY (\`role_id\`)
          REFERENCES \`roles\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_users_created_by_id\` FOREIGN KEY (\`created_by_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`client_profiles\` (
        \`user_id\` char(36) NOT NULL,
        \`cpf\` char(11) NOT NULL,
        \`phone\` varchar(11) NOT NULL,
        \`birth_date\` date NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`uq_client_profiles_cpf\` (\`cpf\`),
        PRIMARY KEY (\`user_id\`),
        CONSTRAINT \`fk_client_profiles_user_id\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT
      ) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`user_tokens\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`type\` enum ('INVITATION') NOT NULL,
        \`token_hash\` char(64) NOT NULL,
        \`expires_at\` datetime(3) NOT NULL,
        \`used_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`idx_user_tokens_user_id_type\` (\`user_id\`, \`type\`),
        UNIQUE INDEX \`uq_user_tokens_token_hash\` (\`token_hash\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_user_tokens_user_id\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa da criação: as tabelas dependentes saem antes de users e roles.
    await queryRunner.query('DROP TABLE `user_tokens`');
    await queryRunner.query('DROP TABLE `client_profiles`');
    await queryRunner.query('DROP TABLE `users`');
    await queryRunner.query('DROP TABLE `roles`');
  }
}
