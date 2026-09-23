import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration inicial: garante charset/collation utf8mb4 no banco,
 * independente de como o servidor MySQL foi configurado (Docker, local ou produção).
 */
export class InitialSetup1790122298215 implements MigrationInterface {
  name = 'InitialSetup1790122298215';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  }

  public async down(): Promise<void> {
    // Sem reversão: o charset anterior do banco não é conhecido.
  }
}
