import { Test } from '@nestjs/testing';

import { BackgroundTasks } from '@shared/application/ports/background-tasks';

import { RequestPasswordResetUseCase } from '../../application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import { PasswordResetsController } from './password-resets.controller';

describe('PasswordResetsController', () => {
  let sut: PasswordResetsController;
  let requestPasswordResetUseCase: jest.Mocked<RequestPasswordResetUseCase>;
  let resetPasswordUseCase: jest.Mocked<ResetPasswordUseCase>;
  let backgroundTasks: jest.Mocked<BackgroundTasks>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PasswordResetsController],
      providers: [
        { provide: RequestPasswordResetUseCase, useValue: { execute: jest.fn() } },
        { provide: ResetPasswordUseCase, useValue: { execute: jest.fn() } },
        { provide: BackgroundTasks, useValue: { run: jest.fn(), drain: jest.fn() } },
      ],
    }).compile();

    sut = moduleRef.get(PasswordResetsController);
    requestPasswordResetUseCase = moduleRef.get(RequestPasswordResetUseCase);
    resetPasswordUseCase = moduleRef.get(ResetPasswordUseCase);
    backgroundTasks = moduleRef.get(BackgroundTasks);
  });

  it('deve responder o pedido sem esperar o caso de uso, que roda em segundo plano (RN20)', async () => {
    requestPasswordResetUseCase.execute.mockResolvedValue();
    const body = { email: 'maria@example.com' };

    const result = sut.request(body);

    expect(result).toBeUndefined();
    expect(requestPasswordResetUseCase.execute).not.toHaveBeenCalled();
    expect(backgroundTasks.run).toHaveBeenCalledTimes(1);
    const [name, task] = backgroundTasks.run.mock.calls[0];
    expect(name).toBe('Pedido de redefinição de senha');
    await task();
    expect(requestPasswordResetUseCase.execute).toHaveBeenCalledWith(body);
  });

  it('deve delegar a redefinição da senha para o caso de uso', async () => {
    resetPasswordUseCase.execute.mockResolvedValue();
    const body = { token: 'segredo', password: 'senha-forte-1' };

    await sut.confirm(body);

    expect(resetPasswordUseCase.execute).toHaveBeenCalledWith(body);
    expect(backgroundTasks.run).not.toHaveBeenCalled();
  });
});
