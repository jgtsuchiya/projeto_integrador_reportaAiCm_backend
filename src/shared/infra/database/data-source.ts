import { join } from 'node:path';

import { DataSource } from 'typeorm';

import { envSchema } from '@config/env.schema';

import { buildDataSourceOptions } from './typeorm.options';

/**
 * DataSource usado apenas pela CLI do TypeORM (scripts migration:* do package.json).
 * A CLI roda sobre o código compilado em dist/, por isso os globs apontam para .js.
 */
const env = envSchema.parse(process.env);

export default new DataSource({
  ...buildDataSourceOptions(env),
  entities: [join(__dirname, '..', '..', '..', '**', '*.orm-entity.js')],
  migrations: [join(__dirname, 'migrations', '*.js')],
});
