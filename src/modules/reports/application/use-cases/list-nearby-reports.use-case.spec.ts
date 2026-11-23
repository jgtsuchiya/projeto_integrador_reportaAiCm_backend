import { InvalidLocationError } from '../../domain/errors/invalid-location.error';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { ReportVoteType } from '../../domain/value-objects/report-vote-type';
import { InMemoryReportRepository, InMemoryReportsDatabase } from '../../testing/in-memory-reports';
import {
  buildPhoto,
  CENTER,
  openTestReport,
  pointNorthOf,
  TEST_REPORTS_CONFIG,
  withReportChanges,
} from '../../testing/report-fixtures';
import { ListNearbyReportsUseCase, NEARBY_REPORTS_LIMIT } from './list-nearby-reports.use-case';

const VIEWER = 'client-1';

describe('ListNearbyReportsUseCase', () => {
  let repository: InMemoryReportRepository;
  let sut: ListNearbyReportsUseCase;

  beforeEach(() => {
    repository = new InMemoryReportRepository(new InMemoryReportsDatabase());
    sut = new ListNearbyReportsUseCase(repository, TEST_REPORTS_CONFIG);
  });

  async function seedAt(
    meters: number,
    changes: { status?: ReportStatus; authorId?: string } = {},
  ): Promise<string> {
    const report = withReportChanges(
      openTestReport({
        authorId: changes.authorId ?? 'client-2',
        location: pointNorthOf(CENTER, meters),
      }),
      changes,
    );
    await repository.create(report, buildPhoto());

    return report.id;
  }

  it('deve listar os reportes no raio, do mais perto ao mais longe, com a distância em metros inteiros', async () => {
    const far = await seedAt(400);
    const near = await seedAt(10);
    await seedAt(2000);

    const result = await sut.execute({ userId: VIEWER, ...CENTER, radiusMeters: 500 });

    expect(result.items.map(({ id }) => id)).toEqual([near, far]);
    // Os pontos estão a 10 m e 400 m no elipsoide. O fake mede na esfera, 0,4% a mais aqui.
    expect(result.items.map(({ distanceMeters }) => distanceMeters)).toEqual([10, 402]);
  });

  it('deve trazer os reportes PENDING e CONFIRMED, sem os REJECTED e os excluídos', async () => {
    const pending = await seedAt(10);
    const confirmed = await seedAt(20, { status: ReportStatus.CONFIRMED });
    await seedAt(30, { status: ReportStatus.REJECTED });
    const deleted = await seedAt(40);
    (await repository.findById(deleted))?.delete('client-2');

    const result = await sut.execute({ userId: VIEWER, ...CENTER, radiusMeters: 1000 });

    expect(result.items.map(({ id }) => id)).toEqual([pending, confirmed]);
  });

  it('deve marcar os reportes do próprio usuário, sem dar a ele as ações nos dos outros', async () => {
    await seedAt(10, { authorId: VIEWER });
    await seedAt(20);

    const result = await sut.execute({ userId: VIEWER, ...CENTER, radiusMeters: 1000 });

    expect(result.items.map(({ isMine, canEdit }) => [isMine, canEdit])).toEqual([
      [true, true],
      [false, false],
    ]);
  });

  it(`deve devolver no máximo ${NEARBY_REPORTS_LIMIT} reportes, os mais perto`, async () => {
    for (let meters = 1; meters <= NEARBY_REPORTS_LIMIT + 1; meters++) {
      await seedAt(meters);
    }

    const result = await sut.execute({ userId: VIEWER, ...CENTER, radiusMeters: 5000 });

    expect(result.items).toHaveLength(NEARBY_REPORTS_LIMIT);
    expect(result.items.at(-1)?.distanceMeters).toBe(NEARBY_REPORTS_LIMIT);
  });

  it('deve recusar a coordenada fora da faixa', async () => {
    await expect(
      sut.execute({ userId: VIEWER, latitude: 91, longitude: 0, radiusMeters: 100 }),
    ).rejects.toThrow(InvalidLocationError);
  });
  it('deve deixar votar só nos reportes de outros, sem o voto do usuário e a até 500 m do ponto', async () => {
    const near = await seedAt(100);
    const voted = await seedAt(200);
    await seedAt(300, { authorId: VIEWER });
    await seedAt(300, { status: ReportStatus.CONFIRMED });
    const far = await seedAt(600);
    await repository.vote(voted, (report) =>
      report.registerVote(VIEWER, ReportVoteType.CONFIRM, TEST_REPORTS_CONFIG),
    );

    const result = await sut.execute({ userId: VIEWER, ...CENTER, radiusMeters: 1000 });

    expect(
      result.items.map(({ id, canVote, votes, isMine, status }) => ({
        id,
        canVote,
        mine: votes.mine,
        isMine,
        status,
      })),
    ).toEqual([
      { id: near, canVote: true, mine: null, isMine: false, status: ReportStatus.PENDING },
      { id: voted, canVote: false, mine: 'CONFIRM', isMine: false, status: ReportStatus.PENDING },
      expect.objectContaining({ canVote: false, mine: null }),
      expect.objectContaining({ canVote: false, mine: null }),
      { id: far, canVote: false, mine: null, isMine: false, status: ReportStatus.PENDING },
    ]);
  });
});
