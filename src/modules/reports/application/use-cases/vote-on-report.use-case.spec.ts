import { randomUUID } from 'node:crypto';

import { DuplicateVoteError } from '../../domain/errors/duplicate-vote.error';
import { EmailVerificationRequiredError } from '../../domain/errors/email-verification-required.error';
import { InaccurateLocationError } from '../../domain/errors/inaccurate-location.error';
import { OwnReportVoteError } from '../../domain/errors/own-report-vote.error';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportNotInValidationError } from '../../domain/errors/report-not-in-validation.error';
import { VoterTooFarError } from '../../domain/errors/voter-too-far.error';
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
import { VoteOnReportInput, VoteOnReportUseCase } from './vote-on-report.use-case';

const AUTHOR = 'client-1';
const VOTER = 'client-2';

describe('VoteOnReportUseCase', () => {
  let database: InMemoryReportsDatabase;
  let repository: InMemoryReportRepository;
  let sut: VoteOnReportUseCase;

  beforeEach(() => {
    database = new InMemoryReportsDatabase();
    repository = new InMemoryReportRepository(database);
    sut = new VoteOnReportUseCase(repository, TEST_REPORTS_CONFIG);
  });

  async function seed(changes: Parameters<typeof withReportChanges>[1] = {}): Promise<string> {
    const report = withReportChanges(openTestReport({ authorId: AUTHOR }), changes);
    await repository.create(report, buildPhoto());

    return report.id;
  }

  /** Voto de quem está a 50 m do reporte, com a precisão de 12 m. */
  function input(reportId: string, overrides: Partial<VoteOnReportInput> = {}): VoteOnReportInput {
    return {
      reportId,
      voterId: VOTER,
      emailVerified: true,
      vote: ReportVoteType.CONFIRM,
      location: { ...pointNorthOf(CENTER, 50), accuracyMeters: 12 },
      ...overrides,
    };
  }

  /** Votos de `count` eleitores diferentes, do tipo informado. */
  async function castVotes(reportId: string, vote: ReportVoteType, count: number): Promise<void> {
    for (let index = 0; index < count; index++) {
      await sut.execute(input(reportId, { voterId: `voter-${vote}-${index}`, vote }));
    }
  }

  it('deve registrar a confirmação e responder o reporte com o voto do usuário', async () => {
    const id = await seed();

    const result = await sut.execute(input(id));

    expect(result).toMatchObject({
      id,
      status: ReportStatus.PENDING,
      votes: {
        confirmations: 1,
        rejections: 0,
        confirmationsRequired: 10,
        rejectionsRequired: 10,
        mine: ReportVoteType.CONFIRM,
      },
      isMine: false,
      canEdit: false,
      canDelete: false,
      canVote: false,
      statusChangedAt: null,
    });
    expect(database.votes).toHaveLength(1);
    expect(database.votes[0]).toMatchObject({ reportId: id, voterId: VOTER, type: 'CONFIRM' });
    expect(database.reports.get(id)?.confirmationsCount).toBe(1);
  });

  it('não deve guardar a localização de quem vota (RN38)', async () => {
    const id = await seed();
    const voter = input(id);

    await sut.execute(voter);

    const stored = JSON.stringify({ votes: database.votes, report: database.reports.get(id) });
    expect(stored).not.toContain(String(voter.location.latitude));
  });

  it('deve recusar o Client com o e-mail não verificado antes de ler o reporte', async () => {
    const id = await seed();
    const findById = jest.spyOn(repository, 'findById');

    await expect(sut.execute(input(id, { emailVerified: false }))).rejects.toThrow(
      new EmailVerificationRequiredError('vote').message,
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('deve responder 404 ao reporte inexistente, ao excluído e ao REJECTED de outro autor', async () => {
    const deleted = await seed();
    database.reports.get(deleted)?.delete(AUTHOR);
    const rejected = await seed({ status: ReportStatus.REJECTED });

    for (const id of [randomUUID(), deleted, rejected]) {
      await expect(sut.execute(input(id))).rejects.toThrow(ReportNotFoundError);
    }
  });

  it('deve recusar o voto do autor no próprio reporte', async () => {
    const id = await seed();

    await expect(sut.execute(input(id, { voterId: AUTHOR }))).rejects.toThrow(OwnReportVoteError);
    expect(database.votes).toHaveLength(0);
  });

  it('deve recusar o voto no reporte que já saiu de validação', async () => {
    const id = await seed({ status: ReportStatus.CONFIRMED, confirmationsCount: 10 });

    await expect(sut.execute(input(id))).rejects.toThrow(ReportNotInValidationError);
  });

  it('deve recusar quem está a 600 m do reporte', async () => {
    const id = await seed();

    await expect(
      sut.execute(input(id, { location: { ...pointNorthOf(CENTER, 600), accuracyMeters: 5 } })),
    ).rejects.toThrow(VoterTooFarError);
    expect(database.votes).toHaveLength(0);
  });

  it('deve recusar a localização imprecisa com a mensagem da abertura', async () => {
    const id = await seed();

    await expect(
      sut.execute(input(id, { location: { ...CENTER, accuracyMeters: 51 } })),
    ).rejects.toThrow(InaccurateLocationError);
  });

  it('deve recusar o segundo voto do mesmo usuário, sem mudar as contagens', async () => {
    const id = await seed();
    await sut.execute(input(id));

    await expect(sut.execute(input(id, { vote: ReportVoteType.DENY }))).rejects.toThrow(
      DuplicateVoteError,
    );
    expect(database.reports.get(id)).toMatchObject({ confirmationsCount: 1, rejectionsCount: 0 });
  });

  it('deve confirmar o reporte na 10ª confirmação e recusar o voto seguinte', async () => {
    const id = await seed();
    await castVotes(id, ReportVoteType.CONFIRM, 9);

    const tenth = await sut.execute(input(id));

    expect(tenth).toMatchObject({
      status: ReportStatus.CONFIRMED,
      votes: { confirmations: 10, mine: ReportVoteType.CONFIRM },
      canVote: false,
    });
    expect(tenth.statusChangedAt).toBeInstanceOf(Date);
    await expect(
      sut.execute(input(id, { voterId: 'client-11', vote: ReportVoteType.DENY })),
    ).rejects.toThrow(ReportNotInValidationError);
  });

  it('deve descartar o reporte com 10 votos "não está lá"', async () => {
    const id = await seed();
    await castVotes(id, ReportVoteType.DENY, 9);

    const tenth = await sut.execute(input(id, { vote: ReportVoteType.DENY }));

    expect(tenth).toMatchObject({ status: ReportStatus.REJECTED, votes: { rejections: 10 } });
    expect(database.reports.get(id)?.isVisibleTo(VOTER)).toBe(false);
  });

  it('deve conferir o status de novo com o reporte travado', async () => {
    // A leitura sem trava vê o reporte em validação, mas outro voto o confirmou antes da trava.
    const id = await seed({ status: ReportStatus.CONFIRMED, confirmationsCount: 10 });
    const stale = withReportChanges(database.reports.get(id)!, {
      status: ReportStatus.PENDING,
      confirmationsCount: 9,
    });
    jest.spyOn(repository, 'findById').mockResolvedValueOnce(stale);

    await expect(sut.execute(input(id))).rejects.toThrow(ReportNotInValidationError);
    expect(database.votes).toHaveLength(0);
  });

  it('deve responder 404 se o autor excluiu o reporte antes da trava', async () => {
    const id = await seed();
    jest.spyOn(repository, 'vote').mockResolvedValueOnce(null);

    await expect(sut.execute(input(id))).rejects.toThrow(ReportNotFoundError);
  });
});
