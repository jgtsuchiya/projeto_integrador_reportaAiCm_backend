import { z } from 'zod';

/** Maior conteúdo de uma coluna MEDIUMBLOB, onde ficam a foto e a miniatura dos reportes. */
const MEDIUMBLOB_MAX_BYTES = 16 * 1024 * 1024 - 1;

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
  // Validade do link de redefinição de senha (RN20).
  PASSWORD_RESET_EXPIRES_IN_MINUTES: z.coerce.number().int().positive().default(60),
  // Validade do link de verificação de e-mail do Client (RN22).
  EMAIL_VERIFICATION_EXPIRES_IN_HOURS: z.coerce.number().int().positive().default(24),
  // Validade do código da segunda etapa do login (RN25).
  MFA_CODE_EXPIRES_IN_MINUTES: z.coerce.number().int().positive().default(10),

  // Bloqueio temporário do login: falhas por e-mail, contadas dentro da janela (RN17).
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  // Limite de requisições por IP em cada rota pública limitada (RN18).
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  // Quantidade de proxies reversos na frente da API. Com 0, o IP do cliente é o da conexão.
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // true para TLS direto (porta 465). Com false, o STARTTLS é usado se o servidor oferecer.
  SMTP_SECURE: z.stringbool().default(false),
  // Vazios quando o servidor não exige autenticação, como o Mailpit em dev.
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().trim().refine(isMailbox, 'Use o formato "Nome <email>" ou só o e-mail.'),

  // Área aceita para os reportes (RN28): latitude mínima, longitude mínima, latitude máxima e
  // longitude máxima. O padrão é uma caixa folgada em volta de Campo Mourão.
  REPORT_AREA_BOUNDS: areaBoundsSchema().prefault('-24.30,-52.65,-23.80,-52.11'),
  // Pior precisão aceita da localização, em metros, na abertura do reporte e no voto (RN28).
  REPORT_MAX_ACCURACY_METERS: z.coerce.number().int().positive().default(50),
  // Tamanho máximo da foto e da miniatura, depois do decode do base64 (RN29). A coluna das
  // imagens (MEDIUMBLOB) guarda até 16 MB.
  REPORT_PHOTO_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(MEDIUMBLOB_MAX_BYTES)
    .default(2097152),
  REPORT_THUMBNAIL_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(MEDIUMBLOB_MAX_BYTES)
    .default(102400),
  // Reportes que cada Client abre em 24 horas (RN30).
  REPORT_DAILY_LIMIT: z.coerce.number().int().positive().default(10),
  // Votos que tornam o reporte CONFIRMED ou REJECTED (RN39).
  REPORT_CONFIRMATIONS_REQUIRED: z.coerce.number().int().positive().default(10),
  REPORT_REJECTIONS_REQUIRED: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

/** Caixa de coordenadas, em graus decimais. */
export interface AreaBounds {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
}

/**
 * `REPORT_AREA_BOUNDS`: quatro números separados por vírgula, convertidos na caixa. Cada
 * coordenada fica na faixa dela, e o mínimo de cada eixo é menor que o máximo.
 */
function areaBoundsSchema(): z.ZodType<AreaBounds, string> {
  return z.string().transform((value, context) => {
    const parts = value.split(',').map((part) => part.trim());
    const numbers = parts.map(Number);

    if (parts.length !== 4 || parts.some((part) => part === '' || !Number.isFinite(Number(part)))) {
      context.addIssue({
        code: 'custom',
        message:
          'Use quatro números separados por vírgula: latitude mínima, longitude mínima, latitude máxima e longitude máxima.',
      });

      return z.NEVER;
    }

    const [minLatitude, minLongitude, maxLatitude, maxLongitude] = numbers;
    const latitudes = [minLatitude, maxLatitude];
    const longitudes = [minLongitude, maxLongitude];

    if (latitudes.some((n) => Math.abs(n) > 90) || longitudes.some((n) => Math.abs(n) > 180)) {
      context.addIssue({
        code: 'custom',
        message: 'A latitude vai de -90 a 90, e a longitude, de -180 a 180.',
      });

      return z.NEVER;
    }

    if (minLatitude >= maxLatitude || minLongitude >= maxLongitude) {
      context.addIssue({
        code: 'custom',
        message: 'O mínimo de cada eixo precisa ser menor que o máximo.',
      });

      return z.NEVER;
    }

    return { minLatitude, minLongitude, maxLatitude, maxLongitude };
  });
}

/** Remetente no formato `Nome <email>` ou só o e-mail. */
function isMailbox(value: string): boolean {
  const address = /<([^<>]+)>$/.exec(value)?.[1] ?? value;

  return z.email().safeParse(address).success;
}
