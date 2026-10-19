import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema dos fluxos de login (docs/sprints/sprint-3-login.md, seção 3): os tipos novos de
 * `user_tokens`, o contador de erros do código da segunda etapa e a tabela `login_attempts`.
 */
export class AddTokenTypesAndLoginAttempts1791171016716 implements MigrationInterface {
  name = 'AddTokenTypesAndLoginAttempts1791171016716';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // O ENUM só ganha valores no fim da lista, então os convites já gravados não mudam.
    await queryRunner.query(
      `ALTER TABLE \`user_tokens\`
        MODIFY \`type\` enum ('INVITATION', 'PASSWORD_RESET', 'EMAIL_VERIFICATION', 'LOGIN_CODE') NOT NULL,
        ADD \`attempts\` tinyint UNSIGNED NOT NULL DEFAULT 0 AFTER \`token_hash\``,
    );

    // Sem FK para users: o e-mail informado no login pode não ter conta.
    await queryRunner.query(
      `CREATE TABLE \`login_attempts\` (
        \`id\` char(36) NOT NULL,
        \`email\` varchar(254) NOT NULL,
        \`ip_address\` varchar(45) NULL,
        \`user_agent\` varchar(255) NULL,
        \`succeeded\` tinyint NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`idx_login_attempts_email_created_at\` (\`email\`, \`created_at\`),
        INDEX \`idx_login_attempts_created_at\` (\`created_at\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `login_attempts`');

    // Os tokens dos tipos novos saem antes: o MySQL recusa reduzir o ENUM com linhas fora dele.
    await queryRunner.query(
      `DELETE FROM \`user_tokens\`
        WHERE \`type\` IN ('PASSWORD_RESET', 'EMAIL_VERIFICATION', 'LOGIN_CODE')`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_tokens\`
        DROP COLUMN \`attempts\`,
        MODIFY \`type\` enum ('INVITATION') NOT NULL`,
    );
  }
}
