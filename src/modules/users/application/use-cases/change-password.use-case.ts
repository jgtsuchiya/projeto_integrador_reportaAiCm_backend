import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { IncorrectPasswordError } from '../../domain/errors/incorrect-password.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { Password } from '../../domain/value-objects/password';
import { IdentityProvider } from '../ports/identity-provider';
import { sendPasswordChangedNotice } from '../services/password-changed-notice';
import { UserMailService } from '../services/user-mail.service';

export interface ChangePasswordInput {
  /** Usuário da sessão. */
  userId: string;
  /** Sessão da requisição, a única mantida depois da troca. */
  sessionHandle: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Troca da própria senha (RN13): confere a senha atual no SuperTokens, grava a nova com a
 * política da RN08 e revoga as outras sessões do usuário. A sessão de quem trocou continua
 * válida. Uma senha atual incorreta gera `IncorrectPasswordError` (401).
 *
 * No fim, o usuário recebe o e-mail de aviso da troca (RN21). Uma falha nesse envio não
 * desfaz a troca.
 */
@Injectable()
export class ChangePasswordUseCase implements UseCase<ChangePasswordInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly identityProvider: IdentityProvider,
    private readonly userMailService: UserMailService,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const newPassword = Password.create(input.newPassword);
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!(await this.identityProvider.verifyPassword(user.email, input.currentPassword))) {
      throw new IncorrectPasswordError('currentPassword');
    }

    await this.identityProvider.updatePassword(user.id, newPassword);
    await this.identityProvider.revokeOtherSessions(user.id, input.sessionHandle);

    await sendPasswordChangedNotice(this.userMailService, user);
  }
}
