import { acceptInvitationBodySchema } from './accept-invitation.dto';

describe('acceptInvitationBodySchema', () => {
  it('deve aceitar um corpo válido, removendo os espaços do token', () => {
    const result = acceptInvitationBodySchema.parse({
      token: ' abc_DEF-123 ',
      password: 'senha-forte-1',
    });

    expect(result).toEqual({ token: 'abc_DEF-123', password: 'senha-forte-1' });
  });

  it('deve aplicar a política de senha do domínio (RN08)', () => {
    const result = acceptInvitationBodySchema.safeParse({
      token: 'abc',
      password: 'somenteletras',
    });

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
    const result = acceptInvitationBodySchema.safeParse({ token, password: 'senha-forte-1' });

    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['token'], message })]);
  });

  it('deve exigir o token e a senha', () => {
    const result = acceptInvitationBodySchema.safeParse({});

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['token', 'password']);
  });
});
