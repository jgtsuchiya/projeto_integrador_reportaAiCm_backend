import { Controller, Get } from '@nestjs/common';

import {
  CheckHealthOutput,
  CheckHealthUseCase,
} from '../../application/use-cases/check-health.use-case';

@Controller('health')
export class HealthController {
  constructor(private readonly checkHealthUseCase: CheckHealthUseCase) {}

  @Get()
  check(): Promise<CheckHealthOutput> {
    return this.checkHealthUseCase.execute();
  }
}
