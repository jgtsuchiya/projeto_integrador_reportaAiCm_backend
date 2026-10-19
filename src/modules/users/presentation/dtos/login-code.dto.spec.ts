import { verifyLoginCodeBodySchema } from './login-code.dto';

describe('verifyLoginCodeBodySchema', () => {
  it('deve aceitar um código de 6 dígitos, removendo os espaços em volta', () => {
    const result = verifyLoginCodeBodySchema.parse({ code: ' 042137 ' });

    expect(result).toEqual({ code: '042137' });
  });

  it.each([
    ['vazio', '  '],
    ['com menos de 6 dígitos', '12345'],
    ['com mais de 6 dígitos', '1234567'],
    ['com letras', '12a456'],
    ['com espaço no meio', '123 456'],
  ])('deve recusar um código %s', (_case, code) => {
    const result = verifyLoginCodeBodySchema.safeParse({ code });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['code'], message: 'O código tem 6 dígitos.' }),
    ]);
  });

  it.each([
    ['ausente', {}],
    ['numérico', { code: 123456 }],
  ])('deve exigir o código como texto (%s)', (_case, body) => {
    const result = verifyLoginCodeBodySchema.safeParse(body);

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual(['code']);
  });
});
