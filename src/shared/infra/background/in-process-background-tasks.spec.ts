import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { BackgroundTasks } from '@shared/application/ports/background-tasks';

import { BackgroundTasksModule } from './background-tasks.module';
import { InProcessBackgroundTasks } from './in-process-background-tasks';

/** Promise que o teste resolve quando quiser. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve;
  });

  return { promise, resolve };
}

describe('InProcessBackgroundTasks', () => {
  let sut: InProcessBackgroundTasks;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    sut = new InProcessBackgroundTasks();
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  it('deve iniciar a tarefa e retornar sem esperar por ela', async () => {
    const task = deferred();
    let finished = false;

    sut.run('Tarefa lenta', async () => {
      await task.promise;
      finished = true;
    });

    expect(finished).toBe(false);
    task.resolve();
    await sut.drain();
    expect(finished).toBe(true);
  });

  it('deve esperar todas as tarefas em andamento no drain', async () => {
    const first = deferred();
    const second = deferred();
    const finished: string[] = [];
    sut.run('Primeira', () => first.promise.then(() => finished.push('primeira')));
    sut.run('Segunda', () => second.promise.then(() => finished.push('segunda')));

    const drained = sut.drain();
    second.resolve();
    first.resolve();
    await drained;

    expect(finished).toEqual(['segunda', 'primeira']);
  });

  it('deve esperar no drain a tarefa iniciada por outra tarefa', async () => {
    const inner = deferred();
    let finished = false;
    sut.run('Externa', async () => {
      sut.run('Interna', async () => {
        await inner.promise;
        finished = true;
      });
    });

    const drained = sut.drain();
    inner.resolve();
    await drained;

    expect(finished).toBe(true);
  });

  it('deve resolver o drain na hora quando não há tarefa em andamento', async () => {
    await expect(sut.drain()).resolves.toBeUndefined();
  });

  it('deve registrar no log a falha da tarefa, com o nome dela, sem rejeitar', async () => {
    const failure = new Error('Banco fora do ar.');

    sut.run('Pedido de redefinição de senha', () => Promise.reject(failure));
    await sut.drain();

    expect(logError).toHaveBeenCalledWith(
      'Falha na tarefa em segundo plano "Pedido de redefinição de senha": Banco fora do ar.',
      failure.stack,
    );
  });

  it('deve registrar no log a tarefa que lança antes de retornar a promise', async () => {
    sut.run('Tarefa quebrada', () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- o que foi lançado pode não ser um Error
      throw 'falhou';
    });
    await sut.drain();

    expect(logError).toHaveBeenCalledWith(
      'Falha na tarefa em segundo plano "Tarefa quebrada": falhou',
      undefined,
    );
  });

  it('deve continuar aceitando tarefas depois de uma falha', async () => {
    let finished = false;
    sut.run('Falha', () => Promise.reject(new Error('Falhou.')));
    await sut.drain();

    sut.run('Sucesso', async () => {
      finished = true;
    });
    await sut.drain();

    expect(finished).toBe(true);
  });

  it('deve segurar o encerramento da aplicação até as tarefas em andamento terminarem', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BackgroundTasksModule],
    }).compile();
    const task = deferred();
    let closed = false;
    moduleRef.get(BackgroundTasks).run('Tarefa lenta', () => task.promise);

    const closing = moduleRef.close().then(() => (closed = true));
    // Tempo de sobra para o encerramento terminar, se ele não esperasse a tarefa.
    await new Promise((resolve) => setImmediate(resolve));

    expect(closed).toBe(false);
    task.resolve();
    await closing;
    expect(closed).toBe(true);
  });
});
