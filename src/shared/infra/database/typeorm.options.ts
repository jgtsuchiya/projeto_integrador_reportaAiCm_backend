import type { DataSourceOptions } from 'typeorm';

import type { Env } from '@config/env.schema';

export type DatabaseEnv = Pick<
  Env,
  'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_DATABASE' | 'DB_LOGGING'
>;

/**
 * Opções de conexão compartilhadas pela aplicação (DatabaseModule),
 * pela CLI de migrations (data-source.ts) e pelos testes de integração.
 */
export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z',
    logging: env.DB_LOGGING,
    // O schema só muda por migrations, nunca por sincronização automática.
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'migrations',
  };
}
