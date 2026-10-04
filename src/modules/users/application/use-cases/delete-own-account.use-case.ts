import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { IncorrectPasswordError } from '../../domain/errors/incorrect-password.error';
import { SelfDeletionNotAllowedError } from '../../domain/errors/self-deletion-not-allowed.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Role } from '../../domain/value-objects/role';
import { IdentityProvider } from '../ports/identity-provider';

export interface DeleteOwnAccountInput {
  /** Usuário da sessão. */
  userId: string;
  /** Senha atual, que confirma a exclusão. */
  password: string;
}

/**
 * Autoexclusão do CLIENT, confirmada com a senha (RN15). No MySQL, o e-mail e o nome são
 * anonimizados, o `deleted_at` é preenchido e o perfil (com o CPF) é removido (RN11, LGPD).
 * O usuário também é removido do SuperTokens, com as credenciais e as sessões. Depois disso,
 * o e-mail e o CPF podem ser cadastrados de novo.
 *
 * O MySQL é o primeiro: se a remoção no SuperTokens falhar, os dados pessoais já foram
 * anonimizados e o acesso já está bloqueado (o login e o guard conferem o MySQL), ficando só a
 * credencial órfã. Na ordem inversa, o CLIENT perderia a credencial com os dados ainda
 * gravados, sem conseguir entrar para repetir a exclusão.
 */
@Injectable()
export class DeleteOwnAccountUseCase implements UseCase<DeleteOwnAccountInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: DeleteOwnAccountInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (user.role !== Role.CLIENT) {
      throw new SelfDeletionNotAllowedError();
    }

    if (!(await this.identityProvider.verifyPassword(user.email, input.password))) {
      throw new IncorrectPasswordError('password');
    }

    user.delete();
    await this.userRepository.deleteClient(user);
    await this.identityProvider.deleteCredentials(user.id);
  }
}
