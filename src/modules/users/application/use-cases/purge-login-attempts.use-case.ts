import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { LOGIN_ATTEMPT_RETENTION_DAYS } from '../../domain/entities/login-attempt.entity';
import { LoginAttemptRepository } from '../../domain/repositories/login-attempt.repository';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Apaga as tentativas de login que passaram do prazo de retenção de 30 dias (RN19). A tabela
 * guarda dado pessoal (e-mail e IP), então as linhas não ficam para sempre.
 */
@Injectable()
export class PurgeLoginAttemptsUseCase implements UseCase {
  constructor(private readonly loginAttemptRepository: LoginAttemptRepository) {}

  async execute(): Promise<void> {
    const limit = new Date(Date.now() - LOGIN_ATTEMPT_RETENTION_DAYS * DAY_IN_MS);

    await this.loginAttemptRepository.deleteOlderThan(limit);
  }
}
