import { formatByteSize } from '@shared/domain/byte-size';

import { InvalidReportImageError } from '../errors/invalid-report-image.error';

export const JPEG_MIME_TYPE = 'image/jpeg';

/** Maior lado da foto e da miniatura, em pixels (RN29). O app gera as duas dentro deles. */
export const REPORT_PHOTO_MAX_DIMENSION = 2048;
export const REPORT_THUMBNAIL_MAX_DIMENSION = 480;

/** As duas imagens do reporte: a foto e a miniatura, geradas pelo app. */
export const ReportImageKind = {
  PHOTO: 'PHOTO',
  THUMBNAIL: 'THUMBNAIL',
} as const;

export type ReportImageKind = (typeof ReportImageKind)[keyof typeof ReportImageKind];

/** Como cada imagem aparece nas mensagens de erro. */
export const REPORT_IMAGE_LABELS: Readonly<Record<ReportImageKind, string>> = {
  PHOTO: 'A foto',
  THUMBNAIL: 'A miniatura',
};

/** Campo de cada imagem no corpo das rotas, que vai nos detalhes do erro. */
const REPORT_IMAGE_FIELDS: Readonly<Record<ReportImageKind, string>> = {
  PHOTO: 'photo.content',
  THUMBNAIL: 'photo.thumbnail',
};

export interface ReportImageRules {
  kind: ReportImageKind;
  /** Tamanho máximo, em bytes, dos dados recebidos. */
  maxBytes: number;
  /** Maior lado, em pixels. */
  maxDimension: number;
}

/** Tamanhos máximos das duas imagens, das variáveis de ambiente. As dimensões são fixas. */
export interface ReportImageLimits {
  /** `REPORT_PHOTO_MAX_BYTES`. */
  photoMaxBytes: number;
  /** `REPORT_THUMBNAIL_MAX_BYTES`. */
  thumbnailMaxBytes: number;
}

export function photoRules(limits: ReportImageLimits): ReportImageRules {
  return {
    kind: ReportImageKind.PHOTO,
    maxBytes: limits.photoMaxBytes,
    maxDimension: REPORT_PHOTO_MAX_DIMENSION,
  };
}

export function thumbnailRules(limits: ReportImageLimits): ReportImageRules {
  return {
    kind: ReportImageKind.THUMBNAIL,
    maxBytes: limits.thumbnailMaxBytes,
    maxDimension: REPORT_THUMBNAIL_MAX_DIMENSION,
  };
}

/**
 * Imagem JPEG do reporte, conferida e sem os metadados (RN29). Os bytes são um `Uint8Array`:
 * o domínio não depende do `Buffer` do Node.
 *
 * A API não reprocessa a imagem: o app já envia os pixels na orientação certa, no tamanho e na
 * qualidade finais. Aqui o formato é conferido pelos bytes, e não pelo que o cliente declara, as
 * dimensões são lidas do cabeçalho, e os segmentos de metadados saem: o APP1 (EXIF e XMP), que
 * pode ter o GPS e o modelo do aparelho, e o APP13 (IPTC). O APP0 (JFIF) e o APP2 (perfil de
 * cor) ficam.
 */
export class ReportImage {
  private constructor(
    readonly bytes: Uint8Array,
    readonly width: number,
    readonly height: number,
  ) {}

  static create(bytes: Uint8Array, rules: ReportImageRules): ReportImage {
    const label = REPORT_IMAGE_LABELS[rules.kind];
    const fail = (problem: string): InvalidReportImageError =>
      new InvalidReportImageError(`${label} ${problem}`, REPORT_IMAGE_FIELDS[rules.kind]);

    // A assinatura vem antes do tamanho: um PNG grande recebe a mensagem do formato.
    if (!hasJpegSignature(bytes)) {
      throw fail('precisa ser uma imagem JPEG.');
    }

    if (bytes.length > rules.maxBytes) {
      throw fail(`passa de ${formatByteSize(rules.maxBytes)}.`);
    }

    const jpeg = parseJpeg(bytes);
    if (!jpeg) {
      throw fail('precisa ser uma imagem JPEG.');
    }

    if (Math.max(jpeg.width, jpeg.height) > rules.maxDimension) {
      throw fail(`passa de ${rules.maxDimension} px no maior lado.`);
    }

    return new ReportImage(jpeg.withoutMetadata, jpeg.width, jpeg.height);
  }

  get mimeType(): string {
    return JPEG_MIME_TYPE;
  }

  /** Tamanho depois da remoção dos metadados. */
  get sizeBytes(): number {
    return this.bytes.length;
  }
}

const MARKER_PREFIX = 0xff;
const START_OF_IMAGE = 0xd8;
const END_OF_IMAGE = 0xd9;
const START_OF_SCAN = 0xda;
/** Segmentos de metadados que saem: APP1 (EXIF e XMP) e APP13 (IPTC). */
const METADATA_MARKERS: ReadonlySet<number> = new Set([0xe1, 0xed]);

interface ParsedJpeg {
  width: number;
  height: number;
  withoutMetadata: Uint8Array;
}

/** Começa com o SOI seguido de outro marcador (`FF D8 FF`) e termina com o EOI (`FF D9`). */
function hasJpegSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === MARKER_PREFIX &&
    bytes[1] === START_OF_IMAGE &&
    bytes[2] === MARKER_PREFIX &&
    bytes[bytes.length - 2] === MARKER_PREFIX &&
    bytes[bytes.length - 1] === END_OF_IMAGE
  );
}

/** Início de quadro (SOF0 a SOF15), menos os marcadores DHT (C4), JPG (C8) e DAC (CC). */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Marcadores sem tamanho: RST0 a RST7 e TEM. */
function isStandalone(marker: number): boolean {
  return (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
}

/**
 * Percorre os segmentos do cabeçalho, do SOI até o início dos dados da imagem (SOS): lê as
 * dimensões do quadro (SOF) e deixa de fora os segmentos de metadados. O que vem a partir do
 * SOS (os dados comprimidos e, no JPEG progressivo, as tabelas e as varreduras seguintes) é
 * copiado como está. Devolve `null` quando a estrutura não é a de um JPEG.
 */
function parseJpeg(bytes: Uint8Array): ParsedJpeg | null {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let frame: { width: number; height: number } | null = null;
  let offset = 2;

  while (offset < bytes.length) {
    const segmentStart = offset;
    if (bytes[offset] !== MARKER_PREFIX) {
      return null;
    }

    // Bytes de preenchimento (FF) podem vir antes do marcador.
    while (offset < bytes.length && bytes[offset] === MARKER_PREFIX) {
      offset++;
    }
    if (offset >= bytes.length) {
      return null;
    }

    const marker = bytes[offset++];
    if (isStandalone(marker)) {
      kept.push(bytes.subarray(segmentStart, offset));
      continue;
    }

    // Um segundo SOI, o EOI antes dos dados da imagem ou um byte que não é marcador.
    if (marker === 0x00 || marker === START_OF_IMAGE || marker === END_OF_IMAGE) {
      return null;
    }

    if (offset + 2 > bytes.length) {
      return null;
    }

    // O tamanho inclui os dois bytes dele mesmo.
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    const end = offset + length;
    if (length < 2 || end > bytes.length) {
      return null;
    }

    if (isStartOfFrame(marker) && !frame) {
      // Precisão (1 byte), altura (2), largura (2) e quantidade de componentes (1).
      if (length < 8) {
        return null;
      }

      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width === 0 || height === 0) {
        return null;
      }

      frame = { width, height };
    }

    if (marker === START_OF_SCAN) {
      if (!frame) {
        return null;
      }

      kept.push(bytes.subarray(segmentStart));

      return { ...frame, withoutMetadata: concat(kept) };
    }

    if (!METADATA_MARKERS.has(marker)) {
      kept.push(bytes.subarray(segmentStart, end));
    }
    offset = end;
  }

  return null;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}
