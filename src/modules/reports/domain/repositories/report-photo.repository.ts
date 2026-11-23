/** Qual das duas imagens da foto ler. Os valores são os da query `size`. */
export const ReportPhotoSize = {
  FULL: 'full',
  THUMBNAIL: 'thumbnail',
} as const;

export type ReportPhotoSize = (typeof ReportPhotoSize)[keyof typeof ReportPhotoSize];

/** Uma das imagens da foto, já sem os metadados. */
export interface ReportPhotoContent {
  /** Id da foto, que muda quando ela é trocada. */
  photoId: string;
  mimeType: string;
  bytes: Uint8Array;
}

export abstract class ReportPhotoRepository {
  /** Lê só a imagem pedida da foto do reporte: a foto inteira ou a miniatura. */
  abstract findContent(reportId: string, size: ReportPhotoSize): Promise<ReportPhotoContent | null>;
}
