import { confirmEmailVerificationBodySchema } from './email-verification.dto';

describe('confirmEmailVerificationBodySchema', () => {
  it('deve aceitar um corpo válido, removendo os espaços do token', () => {
    const result = confirmEmailVerificationBodySchema.parse({ token: ' abc_DEF-123 ' });

    expect(result).toEqual({ token: 'abc_DEF-123' });
  });

  it.each([
    ['vazio', '  ', 'O token é obrigatório.'],
    ['longo demais', 'a'.repeat(257), 'Link inválido, expirado ou já utilizado.'],
  ])('deve recusar um token %s', (_case, token, message) => {
    const result = confirmEmailVerificationBodySchema.safeParse({ token });

    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['token'], message })]);
  });

  it('deve exigir o token', () => {
    const result = confirmEmailVerificationBodySchema.safeParse({});

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['token']);
  });
});
