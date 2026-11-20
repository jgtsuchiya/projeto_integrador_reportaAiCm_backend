import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportRepository } from '../../domain/repositories/report.repository';
import { findVisibleReport } from '../services/find-visible-report';

export interface DeleteReportInput {
  reportId: string;
  /** Usuário da sessão. */
  userId: string;
}

/**
 * Exclusão lógica do reporte pelo autor, enquanto ele está em validação (RN34). O reporte some
 * de todas as rotas e continua contando no limite por dia (RN30).
 */
@Injectable()
export class DeleteReportUseCase implements UseCase<DeleteReportInput> {
  constructor(private readonly reportRepository: ReportRepository) {}

  async execute(input: DeleteReportInput): Promise<void> {
    const report = await findVisibleReport(this.reportRepository, input.reportId, input.userId);

    report.delete(input.userId);
    await this.reportRepository.softDelete(report);
  }
}
