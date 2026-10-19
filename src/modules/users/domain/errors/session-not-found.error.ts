import { NotFoundError } from '@shared/domain/errors/not-found.error';

/**
 * A sessão não existe ou é de outro usuário. A resposta é a mesma nos dois casos, para não
 * revelar que a sessão de outra pessoa existe (RN23).
 */
export class SessionNotFoundError extends NotFoundError {
  constructor() {
    super('Sessão não encontrada.');
  }
}
