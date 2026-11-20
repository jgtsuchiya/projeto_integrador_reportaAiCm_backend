import { ReportStatus } from '../../domain/value-objects/report-status';
import { InMemoryReportRepository, InMemoryReportsDatabase } from '../../testing/in-memory-reports';
import {
  buildPhoto,
  openTestReport,
  TEST_REPORTS_CONFIG,
  withReportChanges,
} from '../../testing/report-fixtures';
import { ListMyReportsUseCase } from './list-my-reports.use-case';

const AUTHOR = 'client-1';

describe('ListMyReportsUseCase', () => {
  let repository: InMemoryReportRepository;
  let sut: ListMyReportsUseCase;

  beforeEach(() => {
    repository = new InMemoryReportRepository(new InMemoryReportsDatabase());
    sut = new ListMyReportsUseCase(repository, TEST_REPORTS_CONFIG);
  });

  async function seed(
    minutesAgo: number,
    status: ReportStatus = ReportStatus.PENDING,
    authorId = AUTHOR,
  ): Promise<string> {
    const report = withReportChanges(openTestReport({ authorId }), {
      status,
      createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
    });
    await repository.create(report, buildPhoto());

    return report.id;
  }

  it('deve listar só os reportes do usuário, do mais novo ao mais antigo, em qualquer status', async () => {
    const older = await seed(30, ReportStatus.REJECTED);
    const newer = await seed(10, ReportStatus.CONFIRMED);
    await seed(5, ReportStatus.PENDING, 'client-2');

    const result = await sut.execute({ userId: AUTHOR, page: 1, pageSize: 20 });

    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(result.items.map(({ id }) => id)).toEqual([newer, older]);
    expect(result.items.every(({ isMine }) => isMine)).toBe(true);
  });

  it('deve filtrar pelo status', async () => {
    await seed(30, ReportStatus.REJECTED);
    const pending = await seed(10, ReportStatus.PENDING);

    const result = await sut.execute({
      userId: AUTHOR,
      page: 1,
      pageSize: 20,
      status: ReportStatus.PENDING,
    });

    expect(result.items.map(({ id }) => id)).toEqual([pending]);
    expect(result.total).toBe(1);
  });

  it('deve paginar e deixar de fora os reportes excluídos', async () => {
    const ids = [await seed(3), await seed(2), await seed(1)];
    (await repository.findById(ids[0]))?.delete(AUTHOR);

    const result = await sut.execute({ userId: AUTHOR, page: 2, pageSize: 1 });

    expect(result).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(result.items.map(({ id }) => id)).toEqual([ids[1]]);
  });

  it('deve calcular o que o autor pode fazer em cada reporte', async () => {
    await seed(10, ReportStatus.CONFIRMED);

    const result = await sut.execute({ userId: AUTHOR, page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({ canEdit: false, canDelete: false });
  });
});
