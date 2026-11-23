import { Report } from '../../domain/entities/report.entity';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportRepository } from '../../domain/repositories/report.repository';

/**
 * Reporte que o usuário pode ver (RN35). O inexistente, o excluído e o que ele não pode ver
 * respondem o mesmo 404, para não revelar que o reporte existe.
 */
export async function findVisibleReport(
  reportRepository: ReportRepository,
  reportId: string,
  userId: string,
): Promise<Report> {
  const report = await reportRepository.findById(reportId);

  if (!report?.isVisibleTo(userId)) {
    throw new ReportNotFoundError();
  }

  return report;
}
