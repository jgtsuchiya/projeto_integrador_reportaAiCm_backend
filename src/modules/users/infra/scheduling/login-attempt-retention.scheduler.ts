import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { PurgeLoginAttemptsUseCase } from '../../application/use-cases/purge-login-attempts.use-case';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Roda a limpeza das tentativas de login antigas (RN19) quando a aplicação sobe e, depois, uma
 * vez por dia. Com mais de uma instância da API, cada uma roda a sua: apagar de novo as mesmas
 * linhas não tem efeito.
 *
 * Uma falha vai só para o log: a limpeza não derruba a API, e a próxima rodada tenta de novo.
 */
@Injectable()
export class LoginAttemptRetentionScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LoginAttemptRetentionScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly purgeLoginAttempts: PurgeLoginAttemptsUseCase) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.purge();

    this.timer = setInterval(() => void this.purge(), DAY_IN_MS);
    // O timer não segura o processo aberto, como o do seed, que termina sozinho.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async purge(): Promise<void> {
    try {
      await this.purgeLoginAttempts.execute();
    } catch (error) {
      this.logger.error(
        `Falha ao apagar as tentativas de login antigas: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
