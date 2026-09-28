import { Controller, Get } from '@nestjs/common';

import { Public } from '@modules/auth/presentation/decorators/public.decorator';

import {
  CheckHealthOutput,
  CheckHealthUseCase,
} from '../../application/use-cases/check-health.use-case';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly checkHealthUseCase: CheckHealthUseCase) {}

  @Get()
  check(): Promise<CheckHealthOutput> {
    return this.checkHealthUseCase.execute();
  }
}
