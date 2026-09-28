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

  SUPERTOKENS_CONNECTION_URI: z.url(),
  // Mesmas restrições que o Core aplica à variável API_KEYS.
  SUPERTOKENS_API_KEY: z
    .string()
    .min(20)
    .regex(/^[A-Za-z0-9=-]+$/, 'Use apenas letras, números, "=" e "-".'),
  API_DOMAIN: z.url(),
  WEB_APP_URL: z.url(),

  // Validade do link de convite do ADM (RN06).
  INVITATION_EXPIRES_IN_HOURS: z.coerce.number().int().positive().default(48),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // true para TLS direto (porta 465). Com false, o STARTTLS é usado se o servidor oferecer.
  SMTP_SECURE: z.stringbool().default(false),
  // Vazios quando o servidor não exige autenticação, como o Mailpit em dev.
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().trim().refine(isMailbox, 'Use o formato "Nome <email>" ou só o e-mail.'),
});

export type Env = z.infer<typeof envSchema>;

/** Remetente no formato `Nome <email>` ou só o e-mail. */
function isMailbox(value: string): boolean {
  const address = /<([^<>]+)>$/.exec(value)?.[1] ?? value;

  return z.email().safeParse(address).success;
}
