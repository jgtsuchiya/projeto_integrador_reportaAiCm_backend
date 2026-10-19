import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { DataSource } from 'typeorm';

import { envSchema } from '@config/env.schema';
import { buildDataSourceOptions } from '@shared/infra/database/typeorm.options';

describe('Banco de dados (integração)', () => {
  const env = envSchema.parse(process.env);
  let dataSource: DataSource;

  beforeAll(async () => {
    // Proteção: os testes de integração alteram o schema; nunca rode contra o banco de desenvolvimento.
    if (!env.DB_DATABASE.endsWith('_test')) {
      throw new Error(`DB_DATABASE deve terminar com "_test" (recebido: "${env.DB_DATABASE}").`);
    }

    dataSource = new DataSource({
      ...buildDataSourceOptions(env),
      migrations: [
        join(__dirname, '..', 'src', 'shared', 'infra', 'database', 'migrations', '*.ts'),
      ],
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  async function countExecutedMigrations(): Promise<number> {
    const [row] = await dataSource.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM migrations',
    );
    return Number(row?.total ?? 0);
  }

  async function listTables(): Promise<string[]> {
    const rows = await dataSource.query<{ name: string }[]>(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
    );
    return rows.map((row) => row.name);
  }

  /** Desfaz as migrations, da mais recente até a informada (inclusive). */
  async function revertDownTo(migration: string): Promise<void> {
    const isExecuted = async (): Promise<boolean> => {
      const rows = await dataSource.query<unknown[]>('SELECT 1 FROM migrations WHERE name = ?', [
        migration,
      ]);
      return rows.length > 0;
    };

    while (await isExecuted()) {
      await dataSource.undoLastMigration();
    }
  }

  it('deve conectar ao banco de teste', async () => {
    const [row] = await dataSource.query<{ db: string }[]>('SELECT DATABASE() AS db');

    expect(dataSource.isInitialized).toBe(true);
    expect(row?.db).toBe(env.DB_DATABASE);
  });

  it('deve executar todas as migrations sem pendências', async () => {
    await dataSource.runMigrations();

    await expect(dataSource.showMigrations()).resolves.toBe(false);
  });

  it('deve reverter todas as migrations e aplicá-las de novo', async () => {
    await dataSource.runMigrations();

    for (let executed = await countExecutedMigrations(); executed > 0; executed--) {
      await dataSource.undoLastMigration();
    }
    const tablesAfterRevert = await listTables();
    await dataSource.runMigrations();

    expect(tablesAfterRevert).toEqual(['migrations']);
    await expect(dataSource.showMigrations()).resolves.toBe(false);
  });

  describe('AddTokenTypesAndLoginAttempts', () => {
    const MIGRATION = 'AddTokenTypesAndLoginAttempts1791171016716';
    const ADMIN_ROLE_ID = 2;

    interface TokenRow {
      type: string;
      token_hash: string;
      expires_at: Date;
      used_at: Date | null;
    }

    const userId = randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    async function insertToken(type: string, tokenHash: string): Promise<void> {
      await dataSource.query(
        'INSERT INTO user_tokens (id, user_id, type, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), userId, type, tokenHash, expiresAt],
      );
    }

    async function listTokens(): Promise<TokenRow[]> {
      return dataSource.query<TokenRow[]>(
        'SELECT type, token_hash, expires_at, used_at FROM user_tokens WHERE user_id = ? ORDER BY type',
        [userId],
      );
    }

    // O banco começa no schema anterior à migration, com um ADMIN convidado (PENDING).
    beforeEach(async () => {
      await dataSource.runMigrations();
      await revertDownTo(MIGRATION);
      await dataSource.query(
        'INSERT INTO users (id, role_id, name, email, status) VALUES (?, ?, ?, ?, ?)',
        [userId, ADMIN_ROLE_ID, 'Admin Fulano', `admin.${userId}@example.com`, 'PENDING'],
      );
      await insertToken('INVITATION', 'a'.repeat(64));
    });

    afterEach(async () => {
      await dataSource.query('DELETE FROM users WHERE id = ?', [userId]);
      await dataSource.runMigrations();
    });

    it('deve manter o convite pendente ao aplicar a migration', async () => {
      await dataSource.runMigrations();

      await expect(listTokens()).resolves.toEqual([
        { type: 'INVITATION', token_hash: 'a'.repeat(64), expires_at: expiresAt, used_at: null },
      ]);
      const [row] = await dataSource.query<{ attempts: number }[]>(
        'SELECT attempts FROM user_tokens WHERE user_id = ?',
        [userId],
      );
      expect(row?.attempts).toBe(0);
    });

    it('deve apagar os tokens dos tipos novos e manter o convite ao reverter', async () => {
      await dataSource.runMigrations();
      await insertToken('PASSWORD_RESET', 'b'.repeat(64));
      await insertToken('EMAIL_VERIFICATION', 'c'.repeat(64));
      await insertToken('LOGIN_CODE', 'd'.repeat(64));
      await dataSource.query('INSERT INTO login_attempts (id, email, succeeded) VALUES (?, ?, ?)', [
        randomUUID(),
        `admin.${userId}@example.com`,
        false,
      ]);

      await revertDownTo(MIGRATION);

      await expect(listTokens()).resolves.toEqual([
        { type: 'INVITATION', token_hash: 'a'.repeat(64), expires_at: expiresAt, used_at: null },
      ]);
      await expect(listTables()).resolves.not.toContain('login_attempts');
    });
  });

  it('deve usar o charset utf8mb4 no banco', async () => {
    const [schema] = await dataSource.query<{ charset: string }[]>(
      'SELECT DEFAULT_CHARACTER_SET_NAME AS charset FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()',
    );

    expect(schema?.charset).toBe('utf8mb4');
  });
});
