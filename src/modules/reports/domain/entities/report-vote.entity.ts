import { Entity } from '@shared/domain/entity';

import { ReportVoteType } from '../value-objects/report-vote-type';

export interface ReportVoteProps {
  reportId: string;
  voterId: string;
  type: ReportVoteType;
  createdAt: Date;
}

/**
 * Voto de um Client num reporte de outro autor (RN37). Nasce em `Report.registerVote`, que
 * confere as regras e soma a contagem, e não muda depois de dado. A localização de quem vota
 * não faz parte do voto: ela só é conferida (RN38).
 */
export class ReportVote extends Entity {
  private constructor(
    id: string | undefined,
    private readonly props: ReportVoteProps,
  ) {
    super(id);
  }

  /** Usado só pelo `Report.registerVote`, que confere as regras antes. */
  static create(input: Omit<ReportVoteProps, 'createdAt'>, createdAt = new Date()): ReportVote {
    return new ReportVote(undefined, { ...input, createdAt });
  }

  /** Reconstrói um voto já persistido, sem validar os dados. */
  static restore(id: string, props: ReportVoteProps): ReportVote {
    return new ReportVote(id, { ...props });
  }

  get reportId(): string {
    return this.props.reportId;
  }

  get voterId(): string {
    return this.props.voterId;
  }

  get type(): ReportVoteType {
    return this.props.type;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
