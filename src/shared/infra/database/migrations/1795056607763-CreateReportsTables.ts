import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabelas dos reportes (docs/sprints/sprint-4-reportes.md, seção 3): o reporte, com a
 * localização numa coluna espacial, e a foto, numa tabela à parte para as listagens não lerem
 * as imagens.
 *
 * O TypeORM não gera o `SRID` das colunas do MySQL, por isso esta migration foi escrita à mão.
 * O MySQL só usa o índice espacial numa coluna `NOT NULL` e restrita a um SRID.
 *
 * O UNIQUE da `Idempotency-Key` começa pela chave, e não pelo autor. Com `(author_id,
 * idempotency_key)`, o MySQL 9.7 usa esse índice para a FK do autor e deixa de conferi-la nas
 * linhas com a chave nula: um reporte sem a chave entrava com um `author_id` inexistente. Com a
 * chave na frente, a FK fica com o índice (`author_id`, `created_at`), que não tem coluna nula.
 */
export class CreateReportsTables1795056607763 implements MigrationInterface {
  name = 'CreateReportsTables1795056607763';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`reports\` (
        \`id\` char(36) NOT NULL,
        \`author_id\` char(36) NOT NULL,
        \`status\` enum ('PENDING', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        \`description\` varchar(500) NULL,
        \`location\` point NOT NULL SRID 4326,
        \`accuracy_meters\` smallint UNSIGNED NOT NULL,
        \`confirmations_count\` smallint UNSIGNED NOT NULL DEFAULT 0,
        \`rejections_count\` smallint UNSIGNED NOT NULL DEFAULT 0,
        \`idempotency_key\` char(36) NULL,
        \`status_changed_at\` datetime(3) NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` datetime(3) NULL,
        INDEX \`idx_reports_author_id_created_at\` (\`author_id\`, \`created_at\`),
        UNIQUE INDEX \`uq_reports_idempotency_key_author_id\` (\`idempotency_key\`, \`author_id\`),
        SPATIAL INDEX \`sidx_reports_location\` (\`location\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_reports_author_id\` FOREIGN KEY (\`author_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB`,
    );

    // As imagens ficam em binário: o base64 é só o formato do transporte, no JSON.
    await queryRunner.query(
      `CREATE TABLE \`report_photos\` (
        \`id\` char(36) NOT NULL,
        \`report_id\` char(36) NOT NULL,
        \`mime_type\` varchar(30) NOT NULL,
        \`width\` smallint UNSIGNED NOT NULL,
        \`height\` smallint UNSIGNED NOT NULL,
        \`size_bytes\` int UNSIGNED NOT NULL,
        \`content\` mediumblob NOT NULL,
        \`thumbnail\` mediumblob NOT NULL,
        \`created_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`uq_report_photos_report_id\` (\`report_id\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_report_photos_report_id\` FOREIGN KEY (\`report_id\`)
          REFERENCES \`reports\` (\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A foto depende do reporte (FK), então sai antes.
    await queryRunner.query('DROP TABLE `report_photos`');
    await queryRunner.query('DROP TABLE `reports`');
  }
}
