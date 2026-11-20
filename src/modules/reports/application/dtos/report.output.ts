import { Report } from '../../domain/entities/report.entity';
import { ReportStatus } from '../../domain/value-objects/report-status';

/** Quantos votos o reporte precisa, para o app mostrar "3 de 10 confirmações". */
export interface VotesRequired {
  confirmationsRequired: number;
  rejectionsRequired: number;
}

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
  votes: VotesRequired & { confirmations: number; rejections: number };
  isMine: boolean;
  /** Calculados pela entidade para o usuário da requisição: os fronts não repetem as regras. */
  canEdit: boolean;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt: Date | null;
}

/** Item do `GET /api/reports/nearby`. */
export interface NearbyReportOutput extends ReportOutput {
  /** Distância até o ponto consultado, em metros inteiros. */
  distanceMeters: number;
}

export function toReportOutput(
  report: Report,
  viewerId: string,
  required: VotesRequired,
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
    },
    isMine: report.isAuthor(viewerId),
    canEdit: report.canBeEditedBy(viewerId),
    canDelete: report.canBeDeletedBy(viewerId),
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    statusChangedAt: report.statusChangedAt,
  };
}
