import { ConflictError } from '@shared/domain/errors/conflict.error';

export class CpfAlreadyInUseError extends ConflictError {
  constructor() {
    super('CPF já cadastrado.', { field: 'cpf' });
  }
}
