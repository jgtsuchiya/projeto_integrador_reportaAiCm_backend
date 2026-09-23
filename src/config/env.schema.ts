import { z } from 'zod';

/**
 * Variáveis de ambiente aceitas pela aplicação.
 * Validadas na inicialização: a aplicação não sobe com configuração inválida.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_DATABASE: z.string().min(1),
  DB_LOGGING: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;
