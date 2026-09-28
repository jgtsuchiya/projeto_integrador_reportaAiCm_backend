import { z } from 'zod';

/**
 * Variáveis usadas só pelo seed (`npm run seed`), fora do `envSchema` para que a API não
 * as exija. A política de senha (RN08) é aplicada pelo domínio, no value object `Password`.
 */
export const seedEnvSchema = z.object({
  SUPER_ADMIN_NAME: z.string().trim().min(1),
  SUPER_ADMIN_EMAIL: z.email(),
  SUPER_ADMIN_PASSWORD: z.string().min(1),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;
