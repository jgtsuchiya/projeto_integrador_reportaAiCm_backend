import { registerClientBodySchema } from './register-client.dto';

describe('registerClientBodySchema', () => {
  const body = {
    name: '  Maria da Silva  ',
    email: 'maria@example.com',
    password: 'senha-forte-1',
    cpf: '529.982.247-25',
    phone: '(43) 99999-8888',
    birthDate: '1990-05-20',
  };

  it('deve aceitar um corpo válido, removendo os espaços do nome e os campos desconhecidos', () => {
    const result = registerClientBodySchema.parse({ ...body, role: 'SUPER_ADMIN' });

    expect(result).toEqual({ ...body, name: 'Maria da Silva' });
  });

  it('deve listar todos os campos inválidos com as mensagens do domínio', () => {
    const result = registerClientBodySchema.safeParse({
      name: '   ',
      email: 'invalido',
      password: 'curta1',
      cpf: '111.111.111-11',
      phone: '123',
      birthDate: '20/05/1990',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ['name'], message: 'O nome é obrigatório.' },
      { path: ['email'], message: 'E-mail inválido.' },
      { path: ['password'], message: 'A senha deve ter de 8 a 128 caracteres.' },
      { path: ['cpf'], message: 'CPF inválido.' },
      { path: ['phone'], message: 'Telefone inválido. Informe o DDD e o número.' },
      { path: ['birthDate'], message: 'Data de nascimento inválida. Use o formato AAAA-MM-DD.' },
    ]);
  });

  it('deve exigir todos os campos', () => {
    const result = registerClientBodySchema.safeParse({});

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual([
      'name',
      'email',
      'password',
      'cpf',
      'phone',
      'birthDate',
    ]);
  });

  it('deve recusar um nome maior que 120 caracteres', () => {
    const result = registerClientBodySchema.safeParse({ ...body, name: 'a'.repeat(121) });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['name'],
        message: 'O nome deve ter no máximo 120 caracteres.',
      }),
    ]);
  });
});
