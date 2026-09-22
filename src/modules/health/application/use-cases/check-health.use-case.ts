import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

export interface CheckHealthOutput {
  status: 'ok';
  timestamp: string;
}

@Injectable()
export class CheckHealthUseCase implements UseCase<void, CheckHealthOutput> {
  async execute(): Promise<CheckHealthOutput> {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
