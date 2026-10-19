import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { EmailRecentlySentError } from '../../domain/errors/email-recently-sent.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { LoginCodeService } from '../services/login-code.service';

export interface ResendLoginCodeInput {
  /** Usuário da sessão pendente. */
  userId: string;
}

/**
 * Reenvio do código da segunda etapa do login, para quem está com a sessão pendente (RN25).
 * O código novo substitui o anterior, que deixa de valer.
 *
 * Quem pede de novo menos de um minuto depois do último código recebe `EmailRecentlySentError`
 * (422), e o código que já foi continua valendo. O intervalo conta também a partir do código
 * enviado no login. Uma falha no envio não vira erro: o motivo fica no log do `MailSender`.
 */
@Injectable()
export class ResendLoginCodeUseCase implements UseCase<ResendLoginCodeInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly loginCodeService: LoginCodeService,
  ) {}

  async execute(input: ResendLoginCodeInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!(await this.loginCodeService.send(user))) {
      throw new EmailRecentlySentError();
    }
  }
}
