import { UnauthorizedError } from '@shared/domain/errors/unauthorized.error';

/** A senha informada para confirmar a troca de senha ou a autoexclusão não confere (RN13, RN15). */
export class IncorrectPasswordError extends UnauthorizedError {
  /** @param field Campo do corpo com a senha conferida (`currentPassword` ou `password`). */
  constructor(field: string) {
    super('Senha incorreta.', { field });
  }
}
