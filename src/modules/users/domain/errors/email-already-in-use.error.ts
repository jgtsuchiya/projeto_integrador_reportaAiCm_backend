import { ConflictError } from '@shared/domain/errors/conflict.error';

export class EmailAlreadyInUseError extends ConflictError {
  constructor() {
    super('E-mail já cadastrado.', { field: 'email' });
  }
}
