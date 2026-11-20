import { ReportAuthorOnlyError } from '../../domain/errors/report-author-only.error';
import { ReportNotDeletableError } from '../../domain/errors/report-not-deletable.error';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { InMemoryReportRepository, InMemoryReportsDatabase } from '../../testing/in-memory-reports';
import { buildPhoto, openTestReport, withReportChanges } from '../../testing/report-fixtures';
import { DeleteReportUseCase } from './delete-report.use-case';

const AUTHOR = 'client-1';
const OTHER = 'client-2';

describe('DeleteReportUseCase', () => {
  let repository: InMemoryReportRepository;
  let sut: DeleteReportUseCase;

  beforeEach(() => {
    repository = new InMemoryReportRepository(new InMemoryReportsDatabase());
    sut = new DeleteReportUseCase(repository);
  });

  async function seed(status: ReportStatus = ReportStatus.PENDING): Promise<string> {
    const report = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });
    await repository.create(report, buildPhoto());

    return report.id;
  }

  it('deve excluir o reporte, que some das buscas e continua contando no limite por dia', async () => {
    const id = await seed();

    await sut.execute({ reportId: id, userId: AUTHOR });

    await expect(repository.findById(id)).resolves.toBeNull();
    await expect(repository.countCreatedSince(AUTHOR, new Date(0))).resolves.toBe(1);
  });

  it('deve responder 403 a quem vê o reporte, mas não é o autor', async () => {
    const id = await seed();

    await expect(sut.execute({ reportId: id, userId: OTHER })).rejects.toThrow(
      ReportAuthorOnlyError,
    );
  });

  it('deve responder 404 a quem não pode ver o reporte', async () => {
    const id = await seed(ReportStatus.REJECTED);

    await expect(sut.execute({ reportId: id, userId: OTHER })).rejects.toThrow(ReportNotFoundError);
  });

  it('deve recusar a exclusão do reporte fora de validação', async () => {
    const id = await seed(ReportStatus.CONFIRMED);

    await expect(sut.execute({ reportId: id, userId: AUTHOR })).rejects.toThrow(
      ReportNotDeletableError,
    );
  });

  it('deve responder 404 ao reporte já excluído', async () => {
    const id = await seed();
    await sut.execute({ reportId: id, userId: AUTHOR });

    await expect(sut.execute({ reportId: id, userId: AUTHOR })).rejects.toThrow(
      ReportNotFoundError,
    );
  });
});
