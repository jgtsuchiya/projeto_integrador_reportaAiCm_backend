import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { InvalidLoginCodeError } from '../../domain/errors/invalid-login-code.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { UserTokenType } from '../../domain/value-objects/user-token-type';

export interface VerifyLoginCodeInput {
  /** Usuário da sessão pendente. */
  userId: string;
  /** Código de 6 dígitos recebido por e-mail. */
  code: string;
}

/**
 * Conferência do código da segunda etapa do login (RN25). O código certo é marcado como
 * usado, e o `last_login_at` é gravado: é aqui que o login com a verificação em duas etapas é
 * concluído. Quem chama marca a sessão como completa em seguida.
 *
 * O código errado conta um erro, e o 5º invalida o código. Um código errado, expirado, já
 * usado, com o limite de erros atingido ou de outro usuário gera sempre o mesmo
 * `InvalidLoginCodeError` (422). O código é buscado pelo usuário da sessão, então o de uma
 * conta nunca vale para outra.
 *
 * O erro é somado e o uso é gravado direto no banco, com condição (`saveFailedAttempt` e
 * `consume`). Sem isso, várias conferências simultâneas leriam o mesmo contador, e o limite
 * de 5 erros não seguraria quem tenta adivinhar o código.
 */
@Injectable()
export class VerifyLoginCodeUseCase implements UseCase<VerifyLoginCodeInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
  ) {}

  async execute(input: VerifyLoginCodeInput): Promise<void> {
    const user = await this.userRepository.findById(input.userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    const token = await this.userTokenRepository.findLatest(user.id, UserTokenType.LOGIN_CODE);
    const now = new Date();

    if (!token?.isUsable(now)) {
      throw new InvalidLoginCodeError();
    }

    if (!token.matchesCode(input.code)) {
      token.registerFailedAttempt();
      await this.userTokenRepository.saveFailedAttempt(token);

      throw new InvalidLoginCodeError();
    }

    token.use(now);

    // Outra conferência pode ter usado o código, ou atingido o limite de erros, depois da leitura.
    if (!(await this.userTokenRepository.consume(token))) {
      throw new InvalidLoginCodeError();
    }

    user.recordLogin();
    await this.userRepository.save(user);
  }
}
