import { Report } from '../../domain/entities/report.entity';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { ReportVoteType, VoteThresholds } from '../../domain/value-objects/report-vote-type';

/** Quantos votos o reporte precisa, para o app mostrar "3 de 10 confirmações". */
export type VotesRequired = VoteThresholds;

/**
 * Reporte como é devolvido ao Client em todas as rotas de `/api/reports`. Nunca traz o id, o
 * nome ou o e-mail do autor: o `isMine` basta para o app (RN35).
 */
export interface ReportOutput {
  id: string;
  status: ReportStatus;
  description: string | null;
  location: { latitude: number; longitude: number; accuracyMeters: number };
  /** Sem as imagens, que vêm pelo `GET /api/reports/:id/photo`. O id muda com a troca da foto. */
  photo: { id: string; width: number; height: number };
  votes: VotesRequired & {
    confirmations: number;
    rejections: number;
    /** O voto do usuário da requisição neste reporte, ou `null` se ele não votou. */
    mine: ReportVoteType | null;
  };
  isMine: boolean;
  /** Calculados pela entidade para o usuário da requisição: os fronts não repetem as regras. */
  canEdit: boolean;
  canDelete: boolean;
  /** Em validação, de outro autor e sem o voto do usuário (RN37). */
  canVote: boolean;
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt: Date | null;
}

/** Item do `GET /api/reports/nearby`. */
export interface NearbyReportOutput extends ReportOutput {
  /** Distância até o ponto consultado, em metros inteiros. */
  distanceMeters: number;
}

/**
 * @param viewerId usuário da requisição, para quem as ações são calculadas.
 * @param viewerVote o voto dele no reporte, lido de `report_votes`. É sempre `null` quando ele é
 * o autor: o autor não vota no próprio reporte (RN37).
 */
export function toReportOutput(
  report: Report,
  viewerId: string,
  required: VotesRequired,
  viewerVote: ReportVoteType | null,
): ReportOutput {
  return {
    id: report.id,
    status: report.status,
    description: report.description?.value ?? null,
    location: {
      latitude: report.location.latitude,
      longitude: report.location.longitude,
      accuracyMeters: report.location.accuracyMeters,
    },
    photo: report.photo,
    votes: {
      confirmations: report.confirmationsCount,
      rejections: report.rejectionsCount,
      confirmationsRequired: required.confirmationsRequired,
      rejectionsRequired: required.rejectionsRequired,
      mine: viewerVote,
    },
    isMine: report.isAuthor(viewerId),
    canEdit: report.canBeEditedBy(viewerId),
    canDelete: report.canBeDeletedBy(viewerId),
    canVote: viewerVote === null && report.canBeVotedBy(viewerId),
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    statusChangedAt: report.statusChangedAt,
  };
}
