import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';
import { Role } from '../../domain/value-objects/role';

export interface GetAuthenticatedUserInput {
  /** Id do usuário da sessão. */
  userId: string;
  /** Handle da sessão da requisição. */
  sessionHandle: string;
}

/** Usuário da requisição, disponível nos controllers pelo `@CurrentUser()`. */
export interface AuthenticatedUser {
  id: string;
  /** Papel lido do MySQL, que é a fonte da verdade (e não do token). */
  role: Role;
  /** Sessão da requisição, que a troca de senha mantém ao revogar as outras (RN13). */
  sessionHandle: string;
}

/**
 * Carrega o usuário de uma sessão válida, conferindo o status no MySQL a cada requisição.
 * Retorna null quando ele não pode mais acessar a API (INACTIVE, PENDING ou excluído), o que
 * faz o bloqueio valer na hora, sem esperar o access token expirar (RN10).
 */
@Injectable()
export class GetAuthenticatedUserUseCase implements UseCase<
  GetAuthenticatedUserInput,
  AuthenticatedUser | null
> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: GetAuthenticatedUserInput): Promise<AuthenticatedUser | null> {
    const user = await this.userRepository.findById(input.userId);

    if (!user?.canAccess()) {
      return null;
    }

    return { id: user.id, role: user.role, sessionHandle: input.sessionHandle };
  }
}
