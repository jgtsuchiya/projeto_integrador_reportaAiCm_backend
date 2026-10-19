import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { LoginAttempt } from '../../domain/entities/login-attempt.entity';
import { LoginAttemptRepository } from '../../domain/repositories/login-attempt.repository';
import { parseLoginEmail } from '../services/login-lock.service';

export interface RecordLoginAttemptInput {
  /** E-mail informado no login, como veio na requisição. */
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** false para a senha incorreta, o e-mail sem conta e o login recusado pela RN09. */
  succeeded: boolean;
}

/**
 * Registra uma tentativa de login já respondida (RN19). As falhas entram na conta do bloqueio
 * por e-mail (RN17), e o sucesso a zera. A senha não chega aqui.
 */
@Injectable()
export class RecordLoginAttemptUseCase implements UseCase<RecordLoginAttemptInput, void> {
  constructor(private readonly loginAttemptRepository: LoginAttemptRepository) {}

  async execute(input: RecordLoginAttemptInput): Promise<void> {
    const email = parseLoginEmail(input.email);

    if (email === null) {
      return;
    }

    await this.loginAttemptRepository.save(LoginAttempt.record({ ...input, email }));
  }
}
