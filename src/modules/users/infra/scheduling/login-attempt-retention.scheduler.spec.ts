import { Logger } from '@nestjs/common';

import { PurgeLoginAttemptsUseCase } from '../../application/use-cases/purge-login-attempts.use-case';
import { LoginAttemptRetentionScheduler } from './login-attempt-retention.scheduler';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('LoginAttemptRetentionScheduler', () => {
  let execute: jest.Mock<Promise<void>, []>;
  let logError: jest.SpyInstance;
  let sut: LoginAttemptRetentionScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    execute = jest.fn<Promise<void>, []>().mockResolvedValue();
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    sut = new LoginAttemptRetentionScheduler({ execute } as unknown as PurgeLoginAttemptsUseCase);
  });

  afterEach(() => {
    sut.onModuleDestroy();
    jest.useRealTimers();
  });

  it('deve rodar a limpeza quando a aplicação sobe', async () => {
    await sut.onApplicationBootstrap();

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('deve repetir a limpeza uma vez por dia', async () => {
    await sut.onApplicationBootstrap();

    await jest.advanceTimersByTimeAsync(DAY_IN_MS - 1);
    const beforeOneDay = execute.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1);
    const afterOneDay = execute.mock.calls.length;
    await jest.advanceTimersByTimeAsync(2 * DAY_IN_MS);

    expect(beforeOneDay).toBe(1);
    expect(afterOneDay).toBe(2);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('deve parar de rodar quando a aplicação é encerrada', async () => {
    await sut.onApplicationBootstrap();

    sut.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(3 * DAY_IN_MS);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('não deve segurar o processo aberto por causa do timer', async () => {
    jest.useRealTimers();
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');

    await sut.onApplicationBootstrap();

    const timer = setIntervalSpy.mock.results[0].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
  });

  it('deve registrar a falha no log e continuar rodando', async () => {
    execute.mockRejectedValueOnce(new Error('Conexão recusada.'));

    await expect(sut.onApplicationBootstrap()).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(DAY_IN_MS);

    expect(logError).toHaveBeenCalledWith(
      'Falha ao apagar as tentativas de login antigas: Conexão recusada.',
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('deve registrar no log uma falha que não é um Error', async () => {
    execute.mockRejectedValueOnce('tempo esgotado');

    await sut.onApplicationBootstrap();

    expect(logError).toHaveBeenCalledWith(
      'Falha ao apagar as tentativas de login antigas: tempo esgotado',
    );
  });

  it('não deve falhar ao ser encerrado sem ter subido', () => {
    expect(() => sut.onModuleDestroy()).not.toThrow();
  });
});
