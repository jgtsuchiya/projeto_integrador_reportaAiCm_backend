import { ReportVoteType } from '../value-objects/report-vote-type';
import { ReportVote } from './report-vote.entity';

describe('ReportVote', () => {
  it('deve nascer com um id próprio e a data informada', () => {
    const createdAt = new Date('2026-11-10T12:00:00.000Z');

    const sut = ReportVote.create(
      { reportId: 'report-1', voterId: 'client-2', type: ReportVoteType.CONFIRM },
      createdAt,
    );

    expect(sut.id).toEqual(expect.any(String));
    expect(sut).toMatchObject({
      reportId: 'report-1',
      voterId: 'client-2',
      type: ReportVoteType.CONFIRM,
      createdAt,
    });
  });

  it('deve usar a data de agora quando nenhuma é informada', () => {
    const before = Date.now();

    const sut = ReportVote.create({
      reportId: 'report-1',
      voterId: 'client-2',
      type: ReportVoteType.DENY,
    });

    expect(sut.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('deve reconstruir o voto gravado com o mesmo id', () => {
    const vote = ReportVote.create({
      reportId: 'report-1',
      voterId: 'client-2',
      type: ReportVoteType.DENY,
    });

    const sut = ReportVote.restore(vote.id, {
      reportId: vote.reportId,
      voterId: vote.voterId,
      type: vote.type,
      createdAt: vote.createdAt,
    });

    expect(sut.equals(vote)).toBe(true);
    expect(sut.type).toBe(ReportVoteType.DENY);
  });
});
