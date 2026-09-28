import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';
import { ConflictError } from '@shared/domain/errors/conflict.error';
import { DomainError } from '@shared/domain/errors/domain.error';
import { ForbiddenError } from '@shared/domain/errors/forbidden.error';
import { NotFoundError } from '@shared/domain/errors/not-found.error';

import { CpfAlreadyInUseError } from './cpf-already-in-use.error';
import { EmailAlreadyInUseError } from './email-already-in-use.error';
import { InvalidBirthDateError } from './invalid-birth-date.error';
import { InvalidCpfError } from './invalid-cpf.error';
import { InvalidEmailError } from './invalid-email.error';
import { InvalidPasswordError } from './invalid-password.error';
import { InvalidPhoneError } from './invalid-phone.error';
import { InvalidStatusTransitionError } from './invalid-status-transition.error';
import { InvalidUserNameError } from './invalid-user-name.error';
import { SuperAdminProtectedError } from './super-admin-protected.error';
import { UserAlreadyDeletedError } from './user-already-deleted.error';
import { UserNotFoundError } from './user-not-found.error';

// A categoria define o status HTTP no GlobalExceptionFilter (400/404/409/422/403).
describe('Erros do domínio de usuários', () => {
  it.each<[DomainError, abstract new (...args: never[]) => DomainError, unknown]>([
    [new InvalidEmailError(), BusinessRuleError, { field: 'email' }],
    [new InvalidCpfError(), BusinessRuleError, { field: 'cpf' }],
    [new InvalidPhoneError(), BusinessRuleError, { field: 'phone' }],
    [new InvalidBirthDateError('mensagem'), BusinessRuleError, { field: 'birthDate' }],
    [new InvalidPasswordError('mensagem'), BusinessRuleError, { field: 'password' }],
    [new InvalidUserNameError('mensagem'), BusinessRuleError, { field: 'name' }],
    [new UserAlreadyDeletedError(), BusinessRuleError, undefined],
    [
      new InvalidStatusTransitionError('PENDING', 'INACTIVE'),
      BusinessRuleError,
      { from: 'PENDING', to: 'INACTIVE' },
    ],
    [new EmailAlreadyInUseError(), ConflictError, { field: 'email' }],
    [new CpfAlreadyInUseError(), ConflictError, { field: 'cpf' }],
    [new SuperAdminProtectedError(), ForbiddenError, undefined],
    [new UserNotFoundError(), NotFoundError, undefined],
  ])('%p deve ser da categoria certa e ter os detalhes esperados', (error, category, details) => {
    expect(error).toBeInstanceOf(category);
    expect(error.message).not.toHaveLength(0);
    expect(error.details).toEqual(details);
  });

  it('deve informar os status na mensagem da transição inválida', () => {
    expect(new InvalidStatusTransitionError('ACTIVE', 'ACTIVE').message).toBe(
      'Não é possível mudar o status do usuário de ACTIVE para ACTIVE.',
    );
  });
});
