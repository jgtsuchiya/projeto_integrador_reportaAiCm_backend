import { requestPasswordResetBodySchema, resetPasswordBodySchema } from './password-reset.dto';

describe('requestPasswordResetBodySchema', () => {
  it('deve aceitar um e-mail válido, sem transformá-lo', () => {
    const result = requestPasswordResetBodySchema.parse({ email: ' Maria@Example.com ' });

    expect(result).toEqual({ email: ' Maria@Example.com ' });
  });

  it.each([
    ['fora do formato', 'nao-e-um-email'],
    ['vazio', ''],
  ])('deve recusar um e-mail %s', (_case, email) => {
    const result = requestPasswordResetBodySchema.safeParse({ email });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['email'], message: 'E-mail inválido.' }),
    ]);
  });

  it('deve exigir o e-mail', () => {
    const result = requestPasswordResetBodySchema.safeParse({});

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['email']);
  });
});

describe('resetPasswordBodySchema', () => {
  it('deve aceitar um corpo válido, removendo os espaços do token', () => {
    const result = resetPasswordBodySchema.parse({
      token: ' abc_DEF-123 ',
      password: 'senha-forte-1',
    });

    expect(result).toEqual({ token: 'abc_DEF-123', password: 'senha-forte-1' });
  });

  it('deve aplicar a política de senha do domínio (RN08)', () => {
    const result = resetPasswordBodySchema.safeParse({ token: 'abc', password: 'somenteletras' });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['password'],
        message: 'A senha deve ter pelo menos uma letra e um número.',
      }),
    ]);
  });

  it.each([
    ['vazio', '  ', 'O token é obrigatório.'],
    ['longo demais', 'a'.repeat(257), 'Link inválido, expirado ou já utilizado.'],
  ])('deve recusar um token %s', (_case, token, message) => {
    const result = resetPasswordBodySchema.safeParse({ token, password: 'senha-forte-1' });

    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['token'], message })]);
  });

  it('deve exigir o token e a senha', () => {
    const result = resetPasswordBodySchema.safeParse({});

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['token', 'password']);
  });
});
