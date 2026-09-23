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

  it('deve conectar ao banco de teste', async () => {
    const [row] = await dataSource.query<{ db: string }[]>('SELECT DATABASE() AS db');

    expect(dataSource.isInitialized).toBe(true);
    expect(row?.db).toBe(env.DB_DATABASE);
  });

  it('deve executar todas as migrations sem pendências', async () => {
    await dataSource.runMigrations();

    await expect(dataSource.showMigrations()).resolves.toBe(false);
  });

  it('deve usar o charset utf8mb4 no banco', async () => {
    const [schema] = await dataSource.query<{ charset: string }[]>(
      'SELECT DEFAULT_CHARACTER_SET_NAME AS charset FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()',
    );

    expect(schema?.charset).toBe('utf8mb4');
  });
});
