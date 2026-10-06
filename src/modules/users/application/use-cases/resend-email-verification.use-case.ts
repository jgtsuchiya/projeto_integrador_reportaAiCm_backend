import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { EmailAlreadyVerifiedError } from '../../domain/errors/email-already-verified.error';
import { EmailRecentlySentError } from '../../domain/errors/email-recently-sent.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { EmailVerificationService } from '../services/email-verification.service';

export interface ResendEmailVerificationInput {
  /** Usuário da sessão. */
  userId: string;
}

/**
 * Reenvio do link de verificação para o usuário logado que ainda não verificou o e-mail
 * (RN22). O link novo substitui os anteriores, que deixam de valer.
 *
 * Quem já verificou recebe `EmailAlreadyVerifiedError`, e quem pede de novo menos de um minuto
 * depois do último e-mail, `EmailRecentlySentError` (os dois são 422). Uma falha no envio não
 * vira erro: o motivo fica no log do `MailSender`, e o usuário pede o reenvio de novo.
 */
@Injectable()
export class ResendEmailVerificationUseCase implements UseCase<ResendEmailVerificationInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async execute(input: ResendEmailVerificationInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (user.emailVerifiedAt !== null) {
      throw new EmailAlreadyVerifiedError();
    }

    // O intervalo conta também a partir do link enviado no cadastro.
    const latest = await this.userTokenRepository.findLatest(
      user.id,
      UserTokenType.EMAIL_VERIFICATION,
    );
    if (latest?.wasIssuedRecently()) {
      throw new EmailRecentlySentError();
    }

    const verification = this.emailVerificationService.issue(user.id);
    await this.userTokenRepository.replace(verification.token);
    await this.emailVerificationService.send(user, verification);
  }
}
