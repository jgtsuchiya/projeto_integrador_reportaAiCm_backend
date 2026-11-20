import { z } from 'zod';

import { pageRequestSchema } from '@shared/presentation/pagination/page-request.schema';
import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { ListMyReportsInput } from '../../application/use-cases/list-my-reports.use-case';
import {
  type ListNearbyReportsInput,
  NEARBY_RADIUS_DEFAULT_METERS,
  NEARBY_RADIUS_MAX_METERS,
  NEARBY_RADIUS_MIN_METERS,
} from '../../application/use-cases/list-nearby-reports.use-case';
import type { ReportPhotoBytes } from '../../application/use-cases/open-report.use-case';
import { ReportPhotoSize } from '../../domain/repositories/report-photo.repository';
import type { GeoLocationInput } from '../../domain/value-objects/geo-location';
import { ReportDescription } from '../../domain/value-objects/report-description';
import type { ReportImageLimits } from '../../domain/value-objects/report-image';
import { ReportStatus } from '../../domain/value-objects/report-status';
import { reportPhotoSchema } from './report-photo.dto';

const LATITUDE_MESSAGE = 'A latitude deve estar entre -90 e 90.';
const LONGITUDE_MESSAGE = 'A longitude deve estar entre -180 e 180.';
const RADIUS_MESSAGE = `O raio deve ser de ${NEARBY_RADIUS_MIN_METERS} a ${NEARBY_RADIUS_MAX_METERS} metros.`;

/** Localização do aparelho, no corpo do `POST`. As regras são as do `GeoLocation`. */
const locationSchema = z.object({
  latitude: z.number().min(-90, LATITUDE_MESSAGE).max(90, LATITUDE_MESSAGE),
  longitude: z.number().min(-180, LONGITUDE_MESSAGE).max(180, LONGITUDE_MESSAGE),
  accuracyMeters: z.number().positive('A precisão deve ser um número de metros maior que zero.'),
}) satisfies z.ZodType<GeoLocationInput>;

/** Vazia ou nula, o reporte fica sem descrição. As regras são as do `ReportDescription`. */
const descriptionSchema = domainString((value) => ReportDescription.create(value))
  .nullable()
  .optional();

/** Corpo do `POST /api/reports`. */
export interface OpenReportBody {
  description?: string | null;
  location: GeoLocationInput;
  photo: ReportPhotoBytes;
}

export function openReportBodySchema(limits: ReportImageLimits): z.ZodType<OpenReportBody> {
  return z.object({
    description: descriptionSchema,
    location: locationSchema,
    photo: reportPhotoSchema(limits),
  });
}

/**
 * Corpo do `PATCH /api/reports/:id`: a descrição e a foto, pelo menos uma. Uma descrição vazia
 * ou nula apaga a atual. A localização não muda e, se enviada, é ignorada (RN28).
 */
export interface EditReportBody {
  description?: string | null;
  photo?: ReportPhotoBytes;
}

export function editReportBodySchema(limits: ReportImageLimits): z.ZodType<EditReportBody> {
  return z
    .object({
      description: descriptionSchema,
      photo: reportPhotoSchema(limits).optional(),
    })
    .refine(
      (body) => body.description !== undefined || body.photo !== undefined,
      'Informe a descrição ou a foto.',
    );
}

/** Header `Idempotency-Key` do `POST /api/reports`: opcional, um UUID (RN31). */
export const idempotencyKeySchema = z
  .uuid('A Idempotency-Key deve ser um UUID.')
  .transform((value) => value.toLowerCase())
  .optional();

/** Query do `GET /api/reports/mine` (`?page=1&pageSize=20&status=PENDING`). */
export const listMyReportsQuerySchema = pageRequestSchema.extend({
  status: z.enum([ReportStatus.PENDING, ReportStatus.CONFIRMED, ReportStatus.REJECTED]).optional(),
}) satisfies z.ZodType<Omit<ListMyReportsInput, 'userId'>>;

export type ListMyReportsQuery = z.infer<typeof listMyReportsQuerySchema>;

/**
 * Query do `GET /api/reports/nearby` (`?latitude=-24.04&longitude=-52.37&radiusMeters=500`). As
 * coordenadas chegam como texto e são obrigatórias: o texto vazio não vira zero.
 */
export const nearbyReportsQuerySchema = z.object({
  latitude: z
    .string({ error: 'Informe a latitude.' })
    .trim()
    .min(1, 'Informe a latitude.')
    .pipe(
      z.coerce
        .number<string>({ error: 'A latitude deve ser um número.' })
        .min(-90, LATITUDE_MESSAGE)
        .max(90, LATITUDE_MESSAGE),
    ),
  longitude: z
    .string({ error: 'Informe a longitude.' })
    .trim()
    .min(1, 'Informe a longitude.')
    .pipe(
      z.coerce
        .number<string>({ error: 'A longitude deve ser um número.' })
        .min(-180, LONGITUDE_MESSAGE)
        .max(180, LONGITUDE_MESSAGE),
    ),
  radiusMeters: z.coerce
    .number({ error: RADIUS_MESSAGE })
    .int(RADIUS_MESSAGE)
    .min(NEARBY_RADIUS_MIN_METERS, RADIUS_MESSAGE)
    .max(NEARBY_RADIUS_MAX_METERS, RADIUS_MESSAGE)
    .default(NEARBY_RADIUS_DEFAULT_METERS),
}) satisfies z.ZodType<Omit<ListNearbyReportsInput, 'userId'>>;

export type NearbyReportsQuery = z.infer<typeof nearbyReportsQuerySchema>;

/** Query do `GET /api/reports/:id/photo` (`?size=thumbnail`). */
export const reportPhotoQuerySchema = z.object({
  size: z.enum([ReportPhotoSize.FULL, ReportPhotoSize.THUMBNAIL]).default(ReportPhotoSize.FULL),
});

export type ReportPhotoQuery = z.infer<typeof reportPhotoQuerySchema>;

/** Resposta do `GET /api/reports/:id/photo`: a imagem em base64 (RFC 4648, com o `=` do fim). */
export interface ReportPhotoResponse {
  /** Id da foto, que muda quando ela é trocada: o app o usa como chave do cache. */
  id: string;
  mimeType: string;
  content: string;
}
