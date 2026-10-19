import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { LoginLockService, parseLoginEmail } from '../services/login-lock.service';

export interface CheckLoginLockInput {
  /** E-mail informado no login, como veio na requisição. */
  email: string;
}

export interface CheckLoginLockOutput {
  locked: boolean;
}

/**
 * Diz, antes de a senha ser conferida, se o login do e-mail está bloqueado por tentativas
 * (RN17). O resultado não depende de o e-mail ter conta.
 *
 * Quem chama recusa o login sem conferir a senha e sem registrar a tentativa: as tentativas
 * recusadas não entram na conta, senão o bloqueio se renovaria sozinho.
 */
@Injectable()
export class CheckLoginLockUseCase implements UseCase<CheckLoginLockInput, CheckLoginLockOutput> {
  constructor(private readonly loginLockService: LoginLockService) {}

  async execute(input: CheckLoginLockInput): Promise<CheckLoginLockOutput> {
    const email = parseLoginEmail(input.email);

    return { locked: email !== null && (await this.loginLockService.isLocked(email)) };
  }
}
