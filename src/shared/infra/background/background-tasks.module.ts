import { Module } from '@nestjs/common';

import { BackgroundTasks } from '@shared/application/ports/background-tasks';

import { InProcessBackgroundTasks } from './in-process-background-tasks';

/**
 * Tarefas em segundo plano, compartilhadas entre os módulos: quem precisa importa o
 * BackgroundTasksModule e injeta o `BackgroundTasks`. Nos testes que sobem a aplicação,
 * `app.get(BackgroundTasks).drain()` espera as tarefas terminarem.
 */
@Module({
  providers: [{ provide: BackgroundTasks, useClass: InProcessBackgroundTasks }],
  exports: [BackgroundTasks],
})
export class BackgroundTasksModule {}
