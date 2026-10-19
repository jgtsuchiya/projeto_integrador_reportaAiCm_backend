import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';

import { BackgroundTasks } from '@shared/application/ports/background-tasks';

/**
 * Implementação do `BackgroundTasks` no próprio processo da API, sem fila: a tarefa começa na
 * hora, e se perde se o processo cair antes de ela terminar. No encerramento normal
 * (`app.close()` ou SIGTERM), a API espera as tarefas em andamento.
 */
@Injectable()
export class InProcessBackgroundTasks implements BackgroundTasks, BeforeApplicationShutdown {
  private readonly logger = new Logger(InProcessBackgroundTasks.name);
  private readonly running = new Set<Promise<void>>();

  run(name: string, task: () => Promise<unknown>): void {
    const execution = this.execute(name, task);

    this.running.add(execution);
    void execution.finally(() => this.running.delete(execution));
  }

  async drain(): Promise<void> {
    // Uma tarefa pode começar enquanto as outras terminam.
    while (this.running.size > 0) {
      await Promise.all(this.running);
    }
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.drain();
  }

  /** Nunca rejeita: o erro da tarefa fica no log. */
  private async execute(name: string, task: () => Promise<unknown>): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.logger.error(
        `Falha na tarefa em segundo plano "${name}": ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
