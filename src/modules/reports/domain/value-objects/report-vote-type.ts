/** Voto na validação comunitária (RN37): o buraco "está lá" ou "não está lá". */
export const ReportVoteType = {
  CONFIRM: 'CONFIRM',
  DENY: 'DENY',
} as const;

export type ReportVoteType = (typeof ReportVoteType)[keyof typeof ReportVoteType];

export const REPORT_VOTE_TYPES: readonly ReportVoteType[] = [
  ReportVoteType.CONFIRM,
  ReportVoteType.DENY,
];

/**
 * Quantos votos de cada tipo mudam o status do reporte (RN39): `REPORT_CONFIRMATIONS_REQUIRED`
 * e `REPORT_REJECTIONS_REQUIRED`. Os dois valores vêm da configuração, que já os valida.
 */
export interface VoteThresholds {
  confirmationsRequired: number;
  rejectionsRequired: number;
}
