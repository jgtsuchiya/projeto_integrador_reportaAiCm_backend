import { NotFoundError } from '@shared/domain/errors/not-found.error';

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('Usuário não encontrado.');
  }
}
