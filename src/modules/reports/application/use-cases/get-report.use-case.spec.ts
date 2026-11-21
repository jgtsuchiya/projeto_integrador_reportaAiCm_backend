import { randomUUID } from 'node:crypto';

import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { ReportVoteType } from '../../domain/value-objects/report-vote-type';
import { InMemoryReportRepository, InMemoryReportsDatabase } from '../../testing/in-memory-reports';
import {
  buildPhoto,
  openTestReport,
  TEST_REPORTS_CONFIG,
  withReportChanges,
} from '../../testing/report-fixtures';
import { GetReportUseCase } from './get-report.use-case';

const AUTHOR = 'client-1';
const OTHER = 'client-2';

describe('GetReportUseCase', () => {
  let repository: InMemoryReportRepository;
  let sut: GetReportUseCase;

  beforeEach(() => {
    repository = new InMemoryReportRepository(new InMemoryReportsDatabase());
    sut = new GetReportUseCase(repository, TEST_REPORTS_CONFIG);
  });

  async function seed(status: ReportStatus = ReportStatus.PENDING): Promise<string> {
    const report = withReportChanges(openTestReport({ authorId: AUTHOR }), { status });
    await repository.create(report, buildPhoto());

    return report.id;
  }

  it('deve mostrar o reporte ao autor, com as ações dele', async () => {
    const id = await seed();

    const result = await sut.execute({ reportId: id, userId: AUTHOR });

    expect(result).toMatchObject({
      id,
      isMine: true,
      canEdit: true,
      canDelete: true,
      canVote: false,
      votes: { mine: null },
    });
  });

  it('deve mostrar o reporte PENDING de outro autor, sem as ações e sem o autor', async () => {
    const id = await seed();

    const result = await sut.execute({ reportId: id, userId: OTHER });

    expect(result).toMatchObject({
      id,
      isMine: false,
      canEdit: false,
      canDelete: false,
      canVote: true,
      votes: { mine: null },
    });
    expect(JSON.stringify(result)).not.toContain(AUTHOR);
  });

  it('deve mostrar ao autor o próprio reporte REJECTED', async () => {
    const id = await seed(ReportStatus.REJECTED);

    await expect(sut.execute({ reportId: id, userId: AUTHOR })).resolves.toMatchObject({ id });
  });

  it('deve responder 404 ao outro autor no reporte REJECTED, para não revelar que ele existe', async () => {
    const id = await seed(ReportStatus.REJECTED);

    await expect(sut.execute({ reportId: id, userId: OTHER })).rejects.toThrow(ReportNotFoundError);
  });

  it('deve responder 404 ao reporte excluído e ao inexistente', async () => {
    const id = await seed();
    (await repository.findById(id))?.delete(AUTHOR);

    await expect(sut.execute({ reportId: id, userId: AUTHOR })).rejects.toThrow(
      ReportNotFoundError,
    );
    await expect(sut.execute({ reportId: randomUUID(), userId: AUTHOR })).rejects.toThrow(
      ReportNotFoundError,
    );
  });
  it('deve trazer o voto do usuário, que não pode mais votar', async () => {
    const id = await seed();
    await repository.vote(id, (report) =>
      report.registerVote(OTHER, ReportVoteType.DENY, TEST_REPORTS_CONFIG),
    );

    const [forVoter, forAuthor] = await Promise.all([
      sut.execute({ reportId: id, userId: OTHER }),
      sut.execute({ reportId: id, userId: AUTHOR }),
    ]);

    expect(forVoter).toMatchObject({
      votes: { rejections: 1, mine: ReportVoteType.DENY },
      canVote: false,
    });
    expect(forAuthor).toMatchObject({ votes: { rejections: 1, mine: null }, canEdit: false });
  });

  it('não deve deixar votar no reporte CONFIRMED', async () => {
    const id = await seed(ReportStatus.CONFIRMED);

    await expect(sut.execute({ reportId: id, userId: OTHER })).resolves.toMatchObject({
      canVote: false,
    });
  });
});
