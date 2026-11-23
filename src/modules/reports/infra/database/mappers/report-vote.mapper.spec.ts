import { ReportVote } from '../../../domain/entities/report-vote.entity';
import { ReportVoteType } from '../../../domain/value-objects/report-vote-type';
import { ReportVoteOrmEntity } from '../entities/report-vote.orm-entity';
import { ReportVoteMapper } from './report-vote.mapper';

describe('ReportVoteMapper', () => {
  it('deve converter o voto para a persistência, com quem votou em user_id', () => {
    const createdAt = new Date('2026-11-10T12:00:00.000Z');
    const vote = ReportVote.create(
      { reportId: 'report-1', voterId: 'client-2', type: ReportVoteType.DENY },
      createdAt,
    );

    const entity = ReportVoteMapper.toPersistence(vote);

    expect(entity).toBeInstanceOf(ReportVoteOrmEntity);
    expect(entity).toEqual({
      id: vote.id,
      reportId: 'report-1',
      userId: 'client-2',
      vote: 'DENY',
      createdAt,
    });
  });
});
