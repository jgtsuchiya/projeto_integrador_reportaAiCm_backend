import { envSchema } from './env.schema';

describe('envSchema', () => {
  const validEnv = {
    DB_HOST: 'localhost',
    DB_USERNAME: 'reportaai',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'reportaai_cm',
    SUPERTOKENS_CONNECTION_URI: 'http://localhost:3567',
    SUPERTOKENS_API_KEY: 'reportaai-dev-supertokens-api-key',
    API_DOMAIN: 'http://localhost:3000',
    WEB_APP_URL: 'http://localhost:5173',
    SMTP_HOST: 'localhost',
    MAIL_FROM: 'ReportaAi Cm <no-reply@reportaai.local>',
  };

  it('deve aplicar os valores padrão quando variáveis opcionais estão ausentes', () => {
    const env = envSchema.parse(validEnv);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_PORT: 3306,
      DB_LOGGING: false,
      INVITATION_EXPIRES_IN_HOURS: 48,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    });
  });

  it('deve converter strings do process.env para os tipos corretos', () => {
    const env = envSchema.parse({
      ...validEnv,
      PORT: '8080',
      DB_PORT: '3307',
      DB_LOGGING: 'true',
      INVITATION_EXPIRES_IN_HOURS: '72',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'true',
    });

    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(3307);
    expect(env.DB_LOGGING).toBe(true);
    expect(env.INVITATION_EXPIRES_IN_HOURS).toBe(72);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('deve rejeitar quando uma variável obrigatória está ausente', () => {
    const { DB_HOST: _omitted, ...withoutHost } = validEnv;

    const result = envSchema.safeParse(withoutHost);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['DB_HOST']);
  });

  it('deve rejeitar porta inválida', () => {
    const result = envSchema.safeParse({ ...validEnv, DB_PORT: 'abc' });

    expect(result.success).toBe(false);
  });

  it('deve rejeitar NODE_ENV fora dos valores permitidos', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' });

    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando a chave de API do SuperTokens está ausente', () => {
    const { SUPERTOKENS_API_KEY: _omitted, ...withoutApiKey } = validEnv;

    const result = envSchema.safeParse(withoutApiKey);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['SUPERTOKENS_API_KEY']);
  });

  it.each([
    ['com menos de 20 caracteres', 'chave-curta'],
    ['com caracteres que o Core não aceita', 'chave_com_underscore_invalida'],
  ])('deve rejeitar a chave de API do SuperTokens %s', (_case, apiKey) => {
    const result = envSchema.safeParse({ ...validEnv, SUPERTOKENS_API_KEY: apiKey });

    expect(result.success).toBe(false);
  });

  it.each(['SUPERTOKENS_CONNECTION_URI', 'API_DOMAIN', 'WEB_APP_URL'])(
    'deve rejeitar %s que não seja uma URL',
    (variable) => {
      const result = envSchema.safeParse({ ...validEnv, [variable]: 'localhost' });

      expect(result.success).toBe(false);
    },
  );

  it.each(['0', '-1', '1.5', 'abc'])(
    'deve rejeitar a validade do convite %p, que não é um número inteiro de horas',
    (hours) => {
      const result = envSchema.safeParse({ ...validEnv, INVITATION_EXPIRES_IN_HOURS: hours });

      expect(result.success).toBe(false);
    },
  );

  it.each(['SMTP_HOST', 'MAIL_FROM'])('deve rejeitar quando %s está ausente', (variable) => {
    const result = envSchema.safeParse({ ...validEnv, [variable]: undefined });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([variable]);
  });

  it.each(['ReportaAi Cm <no-reply@reportaai.local>', ' no-reply@reportaai.local '])(
    'deve aceitar o remetente %p',
    (mailFrom) => {
      const result = envSchema.safeParse({ ...validEnv, MAIL_FROM: mailFrom });

      expect(result.success).toBe(true);
      expect(result.data?.MAIL_FROM).toBe(mailFrom.trim());
    },
  );

  it.each(['ReportaAi Cm', 'ReportaAi Cm no-reply@reportaai.local', 'ReportaAi Cm <no-reply>'])(
    'deve rejeitar o remetente %p, sem um e-mail válido',
    (mailFrom) => {
      const result = envSchema.safeParse({ ...validEnv, MAIL_FROM: mailFrom });

      expect(result.success).toBe(false);
    },
  );
});
