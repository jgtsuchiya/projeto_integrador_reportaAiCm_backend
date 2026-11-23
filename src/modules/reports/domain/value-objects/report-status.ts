/**
 * Status do reporte na validação comunitária. PENDING aparece no app como "Em validação". Os
 * status do atendimento pela prefeitura (em andamento, resolvido) entram com o painel.
 */
export const ReportStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;

export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

/** Status em que os outros cidadãos veem o reporte (RN35). O autor vê em qualquer status. */
export const PUBLIC_REPORT_STATUSES: readonly ReportStatus[] = [
  ReportStatus.PENDING,
  ReportStatus.CONFIRMED,
];
