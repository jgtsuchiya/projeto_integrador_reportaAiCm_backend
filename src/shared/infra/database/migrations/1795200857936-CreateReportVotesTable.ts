import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Votos da validação comunitária dos reportes (docs/sprints/sprint-4-reportes.md, seção 3): um
 * por usuário e reporte, "está lá" (`CONFIRM`) ou "não está lá" (`DENY`). O voto não muda, então
 * a tabela não tem `updated_at`. A localização de quem vota não é gravada (RN38).
 *
 * O UNIQUE (`report_id`, `user_id`) também serve à FK do reporte, e o índice em `user_id`, à FK
 * do usuário. As duas colunas são NOT NULL: a FK do usuário não depende de um índice com coluna
 * nula, o caso que fez a migration CreateReportsTables inverter o UNIQUE da `Idempotency-Key`.
 */
export class CreateReportVotesTable1795200857936 implements MigrationInterface {
  name = 'CreateReportVotesTable1795200857936';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`report_votes\` (
        \`id\` char(36) NOT NULL,
        \`report_id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`vote\` enum ('CONFIRM', 'DENY') NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`idx_report_votes_user_id\` (\`user_id\`),
        UNIQUE INDEX \`uq_report_votes_report_id_user_id\` (\`report_id\`, \`user_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_report_votes_report_id\` FOREIGN KEY (\`report_id\`)
          REFERENCES \`reports\` (\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT,
        CONSTRAINT \`fk_report_votes_user_id\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `report_votes`');
  }
}
