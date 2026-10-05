import { BusinessRuleError } from './business-rule.error';
import { ConflictError } from './conflict.error';
import { DomainError } from './domain.error';
import { ForbiddenError } from './forbidden.error';
import { NotFoundError } from './not-found.error';
import { UnauthorizedError } from './unauthorized.error';

class EmailAlreadyInUseError extends ConflictError {
  constructor() {
    super('E-mail já cadastrado.', { field: 'email' });
  }
}

describe('DomainError', () => {
  it.each([NotFoundError, ConflictError, BusinessRuleError, ForbiddenError, UnauthorizedError])(
    'deve criar %p como erro de domínio com a mensagem informada',
    (errorClass) => {
      const sut = new errorClass('mensagem');

      expect(sut).toBeInstanceOf(Error);
      expect(sut).toBeInstanceOf(DomainError);
      expect(sut.message).toBe('mensagem');
      expect(sut.details).toBeUndefined();
    },
  );

  it('deve usar o nome da classe concreta e manter a categoria nas subclasses', () => {
    const sut = new EmailAlreadyInUseError();

    expect(sut).toBeInstanceOf(ConflictError);
    expect(sut.name).toBe('EmailAlreadyInUseError');
    expect(sut.details).toEqual({ field: 'email' });
  });
});
