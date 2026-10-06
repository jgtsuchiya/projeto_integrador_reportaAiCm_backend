import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { PasswordResetService } from '../services/password-reset.service';

export interface RequestPasswordResetInput {
  email: string;
}

/**
 * Pedido de redefinição de senha, o "esqueci minha senha" (RN20). Só a conta ACTIVE e não
 * excluída recebe o link, que substitui os anteriores. Nos outros casos (e-mail sem conta,
 * conta PENDING, INACTIVE ou excluída), nada é enviado.
 *
 * O caso de uso não diz a quem chama o que aconteceu, e uma falha no envio do e-mail não vira
 * erro. A rota responde 204 sem esperar por ele, para nem a resposta nem o tempo dela
 * revelarem se o e-mail tem conta.
 */
@Injectable()
export class RequestPasswordResetUseCase implements UseCase<RequestPasswordResetInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    // O repositório ignora os excluídos, então a conta excluída também volta null.
    const user = await this.userRepository.findByEmail(Email.create(input.email));

    if (!user?.canAccess()) {
      return;
    }

    // A mesma conta recebe no máximo um e-mail por minuto. O link já enviado continua valendo.
    const latest = await this.userTokenRepository.findLatest(user.id, UserTokenType.PASSWORD_RESET);
    if (latest?.wasIssuedRecently()) {
      return;
    }

    const reset = this.passwordResetService.issue(user.id);
    await this.userTokenRepository.replace(reset.token);
    await this.passwordResetService.send(user, reset);
  }
}
