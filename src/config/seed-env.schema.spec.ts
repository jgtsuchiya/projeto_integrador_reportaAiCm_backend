import { seedEnvSchema } from './seed-env.schema';

describe('seedEnvSchema', () => {
  const validEnv = {
    SUPER_ADMIN_NAME: 'Super Admin',
    SUPER_ADMIN_EMAIL: 'superadmin@reportaai.local',
    SUPER_ADMIN_PASSWORD: 'SuperAdmin123',
  };

  it('deve aceitar as variáveis do SuperAdm', () => {
    const env = seedEnvSchema.parse({ ...validEnv, SUPER_ADMIN_NAME: '  Super Admin  ' });

    expect(env).toEqual(validEnv);
  });

  it.each(['SUPER_ADMIN_NAME', 'SUPER_ADMIN_EMAIL', 'SUPER_ADMIN_PASSWORD'])(
    'deve rejeitar quando %s está ausente',
    (variable) => {
      const result = seedEnvSchema.safeParse({ ...validEnv, [variable]: undefined });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([variable]);
    },
  );

  it.each([
    ['SUPER_ADMIN_NAME', '   '],
    ['SUPER_ADMIN_EMAIL', 'superadmin'],
    ['SUPER_ADMIN_PASSWORD', ''],
  ])('deve rejeitar %s inválida', (variable, value) => {
    const result = seedEnvSchema.safeParse({ ...validEnv, [variable]: value });

    expect(result.success).toBe(false);
  });
});
