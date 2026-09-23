import { Test } from '@nestjs/testing';

import {
  CheckHealthOutput,
  CheckHealthUseCase,
} from '../../application/use-cases/check-health.use-case';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let sut: HealthController;
  let checkHealthUseCase: jest.Mocked<CheckHealthUseCase>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: CheckHealthUseCase,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();

    sut = moduleRef.get(HealthController);
    checkHealthUseCase = moduleRef.get(CheckHealthUseCase);
  });

  it('deve delegar a verificação para o caso de uso e retornar o resultado', async () => {
    const output: CheckHealthOutput = { status: 'ok', timestamp: '2026-01-15T12:00:00.000Z' };
    checkHealthUseCase.execute.mockResolvedValue(output);

    const result = await sut.check();

    expect(checkHealthUseCase.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual(output);
  });
});
