import {
  changePasswordBodySchema,
  deleteOwnAccountBodySchema,
  updateProfileBodySchema,
} from './profile.dto';

describe('updateProfileBodySchema', () => {
  it('deve aceitar o nome, o telefone e a data de nascimento, ignorando e-mail e CPF', () => {
    const result = updateProfileBodySchema.parse({
      name: '  Maria Souza  ',
      phone: '(43) 3222-1111',
      birthDate: '1991-06-21',
      email: 'outro@example.com',
      cpf: '111.444.777-35',
    });

    expect(result).toEqual({
      name: 'Maria Souza',
      phone: '(43) 3222-1111',
      birthDate: '1991-06-21',
    });
  });

  it('deve aceitar só um dos campos', () => {
    expect(updateProfileBodySchema.parse({ name: 'Maria' })).toEqual({ name: 'Maria' });
  });

  it('deve exigir pelo menos um campo', () => {
    const result = updateProfileBodySchema.safeParse({ email: 'outro@example.com' });

    expect(result.error?.issues.map(({ message }) => message)).toEqual([
      'Informe pelo menos um campo para alterar.',
    ]);
  });

  it('deve listar todos os campos inválidos', () => {
    const result = updateProfileBodySchema.safeParse({
      name: ' ',
      phone: '123',
      birthDate: '2999-01-01',
    });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual([
      'name',
      'phone',
      'birthDate',
    ]);
  });
});

describe('changePasswordBodySchema', () => {
  it('deve aceitar uma senha atual fora da política e uma nova senha válida', () => {
    const body = { currentPassword: 'antiga', newPassword: 'senha-nova-2' };

    expect(changePasswordBodySchema.parse(body)).toEqual(body);
  });

  it('deve aplicar a política na nova senha e exigir a senha atual', () => {
    const result = changePasswordBodySchema.safeParse({
      currentPassword: '',
      newPassword: 'curta',
    });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual([
      'currentPassword',
      'newPassword',
    ]);
  });
});

describe('deleteOwnAccountBodySchema', () => {
  it('deve aceitar a senha sem aplicar a política', () => {
    expect(deleteOwnAccountBodySchema.parse({ password: 'antiga' })).toEqual({
      password: 'antiga',
    });
  });

  it.each([{}, { password: '' }])('deve exigir a senha em %p', (body) => {
    const result = deleteOwnAccountBodySchema.safeParse(body);

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['password']);
  });
});
