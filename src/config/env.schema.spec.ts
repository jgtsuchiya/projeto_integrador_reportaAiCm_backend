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
      PASSWORD_RESET_EXPIRES_IN_MINUTES: 60,
      EMAIL_VERIFICATION_EXPIRES_IN_HOURS: 24,
      MFA_CODE_EXPIRES_IN_MINUTES: 10,
      LOGIN_MAX_FAILED_ATTEMPTS: 5,
      LOGIN_LOCK_WINDOW_MINUTES: 15,
      RATE_LIMIT_MAX_REQUESTS: 20,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      TRUST_PROXY: 0,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      REPORT_AREA_BOUNDS: {
        minLatitude: -24.3,
        minLongitude: -52.65,
        maxLatitude: -23.8,
        maxLongitude: -52.11,
      },
      REPORT_MAX_ACCURACY_METERS: 50,
      REPORT_PHOTO_MAX_BYTES: 2097152,
      REPORT_THUMBNAIL_MAX_BYTES: 102400,
      REPORT_DAILY_LIMIT: 10,
      REPORT_CONFIRMATIONS_REQUIRED: 10,
      REPORT_REJECTIONS_REQUIRED: 10,
      REPORT_VOTE_MAX_DISTANCE_METERS: 500,
    });
  });

  describe('variáveis dos reportes', () => {
    it('deve converter as variáveis dos reportes para os tipos corretos', () => {
      const env = envSchema.parse({
        ...validEnv,
        REPORT_AREA_BOUNDS: ' -25.5 , -50 , -25 , -49.5 ',
        REPORT_MAX_ACCURACY_METERS: '30',
        REPORT_PHOTO_MAX_BYTES: '1048576',
        REPORT_THUMBNAIL_MAX_BYTES: '51200',
        REPORT_DAILY_LIMIT: '5',
        REPORT_CONFIRMATIONS_REQUIRED: '3',
        REPORT_REJECTIONS_REQUIRED: '4',
        REPORT_VOTE_MAX_DISTANCE_METERS: '300',
      });

      expect(env).toMatchObject({
        REPORT_AREA_BOUNDS: {
          minLatitude: -25.5,
          minLongitude: -50,
          maxLatitude: -25,
          maxLongitude: -49.5,
        },
        REPORT_MAX_ACCURACY_METERS: 30,
        REPORT_PHOTO_MAX_BYTES: 1048576,
        REPORT_THUMBNAIL_MAX_BYTES: 51200,
        REPORT_DAILY_LIMIT: 5,
        REPORT_CONFIRMATIONS_REQUIRED: 3,
        REPORT_REJECTIONS_REQUIRED: 4,
        REPORT_VOTE_MAX_DISTANCE_METERS: 300,
      });
    });

    it.each([
      ['com três números', '-24.3,-52.65,-23.8'],
      ['com cinco números', '-24.3,-52.65,-23.8,-52.11,0'],
      ['com um texto', '-24.3,-52.65,norte,-52.11'],
      ['com um número vazio', '-24.3,,-23.8,-52.11'],
      ['com a latitude fora da faixa', '-91,-52.65,-23.8,-52.11'],
      ['com a longitude fora da faixa', '-24.3,-181,-23.8,-52.11'],
      ['com a latitude mínima maior que a máxima', '-23.8,-52.65,-24.3,-52.11'],
      ['com a longitude mínima igual à máxima', '-24.3,-52.11,-23.8,-52.11'],
    ])('deve rejeitar a REPORT_AREA_BOUNDS %s', (_case, bounds) => {
      const result = envSchema.safeParse({ ...validEnv, REPORT_AREA_BOUNDS: bounds });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['REPORT_AREA_BOUNDS']);
    });

    it.each([
      ['REPORT_MAX_ACCURACY_METERS', '0'],
      ['REPORT_MAX_ACCURACY_METERS', '1.5'],
      ['REPORT_PHOTO_MAX_BYTES', '-1'],
      ['REPORT_PHOTO_MAX_BYTES', '16777216'],
      ['REPORT_THUMBNAIL_MAX_BYTES', 'abc'],
      ['REPORT_DAILY_LIMIT', '0'],
      ['REPORT_CONFIRMATIONS_REQUIRED', '-1'],
      ['REPORT_REJECTIONS_REQUIRED', '2.5'],
      ['REPORT_VOTE_MAX_DISTANCE_METERS', '0'],
    ])('deve rejeitar %s=%p', (variable, value) => {
      const result = envSchema.safeParse({ ...validEnv, [variable]: value });

      expect(result.success).toBe(false);
    });
  });

  it('deve converter strings do process.env para os tipos corretos', () => {
    const env = envSchema.parse({
      ...validEnv,
      PORT: '8080',
      DB_PORT: '3307',
      DB_LOGGING: 'true',
      INVITATION_EXPIRES_IN_HOURS: '72',
      PASSWORD_RESET_EXPIRES_IN_MINUTES: '30',
      EMAIL_VERIFICATION_EXPIRES_IN_HOURS: '12',
      MFA_CODE_EXPIRES_IN_MINUTES: '5',
      LOGIN_MAX_FAILED_ATTEMPTS: '3',
      LOGIN_LOCK_WINDOW_MINUTES: '30',
      RATE_LIMIT_MAX_REQUESTS: '100',
      RATE_LIMIT_WINDOW_SECONDS: '30',
      TRUST_PROXY: '1',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'true',
    });

    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(3307);
    expect(env.DB_LOGGING).toBe(true);
    expect(env.INVITATION_EXPIRES_IN_HOURS).toBe(72);
    expect(env.PASSWORD_RESET_EXPIRES_IN_MINUTES).toBe(30);
    expect(env.EMAIL_VERIFICATION_EXPIRES_IN_HOURS).toBe(12);
    expect(env.MFA_CODE_EXPIRES_IN_MINUTES).toBe(5);
    expect(env.LOGIN_MAX_FAILED_ATTEMPTS).toBe(3);
    expect(env.LOGIN_LOCK_WINDOW_MINUTES).toBe(30);
    expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    expect(env.RATE_LIMIT_WINDOW_SECONDS).toBe(30);
    expect(env.TRUST_PROXY).toBe(1);
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

  it.each([
    ['PASSWORD_RESET_EXPIRES_IN_MINUTES', '0'],
    ['PASSWORD_RESET_EXPIRES_IN_MINUTES', '-1'],
    ['PASSWORD_RESET_EXPIRES_IN_MINUTES', '1.5'],
    ['PASSWORD_RESET_EXPIRES_IN_MINUTES', 'abc'],
    ['EMAIL_VERIFICATION_EXPIRES_IN_HOURS', '0'],
    ['EMAIL_VERIFICATION_EXPIRES_IN_HOURS', '-1'],
    ['EMAIL_VERIFICATION_EXPIRES_IN_HOURS', '1.5'],
    ['EMAIL_VERIFICATION_EXPIRES_IN_HOURS', 'abc'],
    ['MFA_CODE_EXPIRES_IN_MINUTES', '0'],
    ['MFA_CODE_EXPIRES_IN_MINUTES', '-1'],
    ['MFA_CODE_EXPIRES_IN_MINUTES', '1.5'],
    ['MFA_CODE_EXPIRES_IN_MINUTES', 'abc'],
    ['LOGIN_MAX_FAILED_ATTEMPTS', '0'],
    ['LOGIN_MAX_FAILED_ATTEMPTS', '-1'],
    ['LOGIN_MAX_FAILED_ATTEMPTS', '1.5'],
    ['LOGIN_MAX_FAILED_ATTEMPTS', 'abc'],
    ['LOGIN_LOCK_WINDOW_MINUTES', '0'],
    ['LOGIN_LOCK_WINDOW_MINUTES', '-1'],
    ['LOGIN_LOCK_WINDOW_MINUTES', '1.5'],
    ['LOGIN_LOCK_WINDOW_MINUTES', 'abc'],
    ['RATE_LIMIT_MAX_REQUESTS', '0'],
    ['RATE_LIMIT_MAX_REQUESTS', '-1'],
    ['RATE_LIMIT_MAX_REQUESTS', '1.5'],
    ['RATE_LIMIT_MAX_REQUESTS', 'abc'],
    ['RATE_LIMIT_WINDOW_SECONDS', '0'],
    ['RATE_LIMIT_WINDOW_SECONDS', '-1'],
    ['RATE_LIMIT_WINDOW_SECONDS', '1.5'],
    ['RATE_LIMIT_WINDOW_SECONDS', 'abc'],
  ])('deve rejeitar %s=%p, que não é um número inteiro positivo', (variable, value) => {
    const result = envSchema.safeParse({ ...validEnv, [variable]: value });

    expect(result.success).toBe(false);
  });

  it.each(['-1', '1.5', 'true', 'abc'])(
    'deve rejeitar TRUST_PROXY=%p, que não é uma quantidade de proxies',
    (proxies) => {
      const result = envSchema.safeParse({ ...validEnv, TRUST_PROXY: proxies });

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
