import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';
import { Page, PageRequest } from '@shared/domain/pagination';

import { ReportRepository } from '../../domain/repositories/report.repository';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { ReportOutput, toReportOutput } from '../dtos/report.output';
import { ReportsConfig } from '../reports.config';

export interface ListMyReportsInput extends PageRequest {
  /** Usuário da sessão. */
  userId: string;
  status?: ReportStatus;
}

/** Reportes do próprio usuário, em qualquer status e sem os excluídos, do mais novo ao mais antigo. */
@Injectable()
export class ListMyReportsUseCase implements UseCase<ListMyReportsInput, Page<ReportOutput>> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly config: ReportsConfig,
  ) {}

  async execute({ userId, status, ...page }: ListMyReportsInput): Promise<Page<ReportOutput>> {
    const result = await this.reportRepository.findByAuthor(userId, page, { status });

    return {
      ...result,
      items: result.items.map((report) => toReportOutput(report, userId, this.config)),
    };
  }
}
