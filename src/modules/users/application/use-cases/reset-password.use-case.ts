import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { Password } from '../../domain/value-objects/password';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { IdentityProvider } from '../ports/identity-provider';
import { findUsableTokenOrFail } from '../services/find-user-token';
import { LoginLockService } from '../services/login-lock.service';
import { sendPasswordChangedNotice } from '../services/password-changed-notice';
import { UserMailService } from '../services/user-mail.service';

export interface ResetPasswordInput {
  /** Segredo recebido no link do e-mail. */
  token: string;
  password: string;
}

/**
 * Redefinição da senha com o token do link (RN21): grava a senha nova no SuperTokens, revoga
 * todas as sessões do usuário, zera o bloqueio do login por tentativas, preenche o
 * `email_verified_at` (o link prova a posse do e-mail) e marca o token como usado. No fim, o
 * usuário recebe o e-mail de aviso da troca.
 *
 * Um token inexistente, de outro tipo, expirado, usado ou substituído por um pedido novo gera
 * sempre o mesmo `InvalidUserTokenError` (422).
 */
@Injectable()
export class ResetPasswordUseCase implements UseCase<ResetPasswordInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
    private readonly identityProvider: IdentityProvider,
    private readonly loginLockService: LoginLockService,
    private readonly userMailService: UserMailService,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const password = Password.create(input.password);
    const token = await findUsableTokenOrFail(
      this.userTokenRepository,
      input.token,
      UserTokenType.PASSWORD_RESET,
    );

    // O link de uma conta excluída, ou que deixou de estar ACTIVE depois do pedido, não vale mais.
    const user = await this.userRepository.findById(token.userId);
    if (!user?.canAccess()) {
      throw new InvalidUserTokenError();
    }

    // O token é o último a ser gravado. Se um passo antes dele falhar, o link continua
    // válido, e basta redefinir de novo: todos esses passos podem ser repetidos.
    await this.identityProvider.updatePassword(user.id, password);
    await this.identityProvider.revokeAllSessions(user.id);
    await this.loginLockService.clear(user.email);

    user.verifyEmail();
    token.use();
    await this.userRepository.saveWithToken(user, token);

    await sendPasswordChangedNotice(this.userMailService, user);
  }
}
