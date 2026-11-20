import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportRepository } from '../../domain/repositories/report.repository';
import { ReportOutput, toReportOutput } from '../dtos/report.output';
import { ReportsConfig } from '../reports.config';
import { findVisibleReport } from '../services/find-visible-report';

export interface GetReportInput {
  reportId: string;
  /** Usuário da sessão. */
  userId: string;
}

/** Detalhe do reporte, se o usuário pode vê-lo (RN35). */
@Injectable()
export class GetReportUseCase implements UseCase<GetReportInput, ReportOutput> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly config: ReportsConfig,
  ) {}

  async execute(input: GetReportInput): Promise<ReportOutput> {
    const report = await findVisibleReport(this.reportRepository, input.reportId, input.userId);

    return toReportOutput(report, input.userId, this.config);
  }
}
