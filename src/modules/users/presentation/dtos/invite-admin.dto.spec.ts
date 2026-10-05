import { inviteAdminBodySchema } from './invite-admin.dto';

describe('inviteAdminBodySchema', () => {
  it('deve aceitar um corpo válido, removendo os espaços do nome e os campos desconhecidos', () => {
    const result = inviteAdminBodySchema.parse({
      name: '  Ana Souza  ',
      email: 'ana@example.com',
      invitedById: 'outro-usuario',
      role: 'SUPER_ADMIN',
    });

    expect(result).toEqual({ name: 'Ana Souza', email: 'ana@example.com' });
  });

  it('deve listar os campos inválidos com as mensagens do domínio', () => {
    const result = inviteAdminBodySchema.safeParse({ name: 'a'.repeat(121), email: 'invalido' });

    expect(result.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ['name'], message: 'O nome deve ter no máximo 120 caracteres.' },
      { path: ['email'], message: 'E-mail inválido.' },
    ]);
  });

  it('deve exigir o nome e o e-mail', () => {
    const result = inviteAdminBodySchema.safeParse({});

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['name', 'email']);
  });
});
