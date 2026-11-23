import { z } from 'zod';

import {
  base64Length,
  decodeBase64,
  InvalidBase64Error,
} from '@shared/application/encoding/base64';
import { DomainError } from '@shared/domain/errors/domain.error';

import type { ReportPhotoBytes } from '../../application/use-cases/open-report.use-case';
import {
  photoRules,
  REPORT_IMAGE_LABELS,
  ReportImage,
  ReportImageLimits,
  ReportImageRules,
  thumbnailRules,
} from '../../domain/value-objects/report-image';

/** Folga para o resto do corpo (descrição, localização e nomes dos campos) no limite do corpo. */
const BODY_OVERHEAD_BYTES = 16 * 1024;

/**
 * Imagem JPEG em base64 (RFC 4648), no espírito do `domainString`: o texto é decodificado e
 * conferido pela fábrica do `ReportImage`, e a mensagem do erro de domínio vira a do campo. O
 * valor sai em bytes: o caso de uso recebe os bytes, e não o base64, e cria o `ReportImage` de
 * novo, tirando os metadados.
 */
export function base64JpegSchema(rules: ReportImageRules): z.ZodType<Uint8Array, string> {
  return z.string().transform((value, context) => {
    let bytes: Uint8Array;

    try {
      bytes = decodeBase64(value);
    } catch (error) {
      if (!(error instanceof InvalidBase64Error)) {
        throw error;
      }

      context.addIssue({
        code: 'custom',
        message: `${REPORT_IMAGE_LABELS[rules.kind]} precisa estar em base64, sem o prefixo "data:".`,
      });

      return z.NEVER;
    }

    try {
      ReportImage.create(bytes, rules);
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }

      context.addIssue({ code: 'custom', message: error.message });

      return z.NEVER;
    }

    return bytes;
  });
}

/** A foto e a miniatura, em base64, com os limites da configuração (RN29). */
export function reportPhotoSchema(limits: ReportImageLimits): z.ZodType<ReportPhotoBytes> {
  return z.object({
    content: base64JpegSchema(photoRules(limits)),
    thumbnail: base64JpegSchema(thumbnailRules(limits)),
  });
}

/**
 * Limite do corpo das rotas de reportes: as duas imagens no tamanho máximo, em base64, e a folga
 * para o resto do corpo. Com os padrões, perto de 3 MB. As outras rotas ficam com 100 KB.
 */
export function reportsBodyLimitBytes(limits: ReportImageLimits): number {
  return (
    base64Length(limits.photoMaxBytes) +
    base64Length(limits.thumbnailMaxBytes) +
    BODY_OVERHEAD_BYTES
  );
}
