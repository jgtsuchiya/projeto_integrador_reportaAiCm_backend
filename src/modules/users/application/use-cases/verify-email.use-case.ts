import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { findUsableTokenOrFail } from '../services/find-user-token';

export interface VerifyEmailInput {
  /** Segredo recebido no link do e-mail. */
  token: string;
}

/**
 * Confirmação do e-mail com o token do link (RN22): preenche o `email_verified_at` e marca o
 * token como usado. Quem abre o link não precisa de sessão: o token já identifica a conta.
 *
 * Um token inexistente, de outro tipo, expirado, usado ou substituído por um reenvio gera
 * sempre o mesmo `InvalidUserTokenError` (422). O de uma conta excluída também.
 */
@Injectable()
export class VerifyEmailUseCase implements UseCase<VerifyEmailInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
  ) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const token = await findUsableTokenOrFail(
      this.userTokenRepository,
      input.token,
      UserTokenType.EMAIL_VERIFICATION,
    );

    // O repositório ignora os excluídos: o link de uma conta excluída não vale mais. O de uma
    // conta INACTIVE vale, porque o link prova a posse do e-mail e não dá acesso a nada.
    const user = await this.userRepository.findById(token.userId);
    if (!user) {
      throw new InvalidUserTokenError();
    }

    user.verifyEmail();
    token.use();
    await this.userRepository.saveWithToken(user, token);
  }
}
