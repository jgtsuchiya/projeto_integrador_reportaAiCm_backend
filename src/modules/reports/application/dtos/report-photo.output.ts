/**
 * Uma das imagens da foto do reporte, em bytes. A apresentação a envia em base64: o formato do
 * transporte não é decisão do caso de uso.
 */
export interface ReportPhotoOutput {
  /** Id da foto, que muda quando ela é trocada: o app o usa como chave do cache. */
  id: string;
  mimeType: string;
  content: Uint8Array;
}
