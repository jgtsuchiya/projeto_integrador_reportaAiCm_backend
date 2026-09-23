import { envSchema } from './env.schema';

describe('envSchema', () => {
  const validEnv = {
    DB_HOST: 'localhost',
    DB_USERNAME: 'reportaai',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'reportaai_cm',
  };

  it('deve aplicar os valores padrão quando variáveis opcionais estão ausentes', () => {
    const env = envSchema.parse(validEnv);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_PORT: 3306,
      DB_LOGGING: false,
    });
  });

  it('deve converter strings do process.env para os tipos corretos', () => {
    const env = envSchema.parse({ ...validEnv, PORT: '8080', DB_PORT: '3307', DB_LOGGING: 'true' });

    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(3307);
    expect(env.DB_LOGGING).toBe(true);
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
});
