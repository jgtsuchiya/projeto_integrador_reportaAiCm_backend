import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

import { domainString } from './domain-string.schema';

function createCode(raw: string): string {
  if (!/^[A-Z]{3}$/.test(raw)) {
    throw new BusinessRuleError('Código inválido.');
  }

  return raw;
}

describe('domainString', () => {
  const sut = domainString(createCode);

  it('deve aceitar o valor que a fábrica aceita, sem transformá-lo', () => {
    expect(sut.parse('ABC')).toBe('ABC');
  });

  it('deve converter o erro de domínio numa falha de validação com a mesma mensagem', () => {
    const result = sut.safeParse('abc');

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'custom', message: 'Código inválido.' }),
    ]);
  });

  it('deve recusar um valor que não é string sem chamar a fábrica', () => {
    const create = jest.fn();

    const result = domainString(create).safeParse(42);

    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('deve deixar escapar um erro que não é de domínio', () => {
    const failure = new Error('Bug na fábrica.');

    const schema = domainString(() => {
      throw failure;
    });

    expect(() => schema.parse('ABC')).toThrow(failure);
  });
});
