/**
 * Porta para o trabalho que continua depois de a requisição ser respondida, compartilhada
 * entre os módulos: quem precisa importa o `BackgroundTasksModule` e injeta o `BackgroundTasks`.
 *
 * Serve para quando a resposta não pode esperar o trabalho, como no pedido de redefinição de
 * senha, em que o tempo de resposta revelaria se o e-mail tem conta.
 */
export abstract class BackgroundTasks {
  /**
   * Inicia a tarefa e retorna sem esperar por ela. Uma falha vai só para o log, identificada
   * pelo `name`: a requisição já foi respondida, e não há para quem devolver o erro.
   */
  abstract run(name: string, task: () => Promise<unknown>): void;

  /** Espera as tarefas em andamento terminarem. Usado no encerramento da API e nos testes. */
  abstract drain(): Promise<void>;
}
