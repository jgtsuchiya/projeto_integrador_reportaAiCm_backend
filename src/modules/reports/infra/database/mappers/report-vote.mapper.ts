import { ReportVote } from '../../../domain/entities/report-vote.entity';
import { ReportVoteOrmEntity } from '../entities/report-vote.orm-entity';

export class ReportVoteMapper {
  static toPersistence(vote: ReportVote): ReportVoteOrmEntity {
    const entity = new ReportVoteOrmEntity();
    entity.id = vote.id;
    entity.reportId = vote.reportId;
    entity.userId = vote.voterId;
    entity.vote = vote.type;
    entity.createdAt = vote.createdAt;

    return entity;
  }
}
