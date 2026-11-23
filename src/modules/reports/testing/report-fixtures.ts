import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReportsConfig } from '../application/reports.config';
import { ReportPhoto } from '../domain/entities/report-photo.entity';
import { Report, ReportProps } from '../domain/entities/report.entity';
import { GeoLocation, GeoLocationInput } from '../domain/value-objects/geo-location';
import { GeoPointInput } from '../domain/value-objects/geo-point';
import { ReportArea, ReportAreaBounds } from '../domain/value-objects/report-area';
import { ReportDescription } from '../domain/value-objects/report-description';
import { ReportImageLimits } from '../domain/value-objects/report-image';

/** Imagens de `test/fixtures` (ver docs/TESTING.md), com as dimensões de cada uma. */
export const JpegFixture = {
  /** 160 × 120, baseline, só com o JFIF. */
  PHOTO: 'report-photo.jpg',
  /** 48 × 36, baseline. */
  THUMBNAIL: 'report-thumbnail.jpg',
  /** 200 × 150, progressivo. */
  PROGRESSIVE: 'report-photo-progressive.jpg',
  /** 160 × 120, com EXIF com GPS e XMP (APP1), perfil de cor (APP2) e IPTC (APP13). */
  WITH_METADATA: 'report-photo-metadata.jpg',
} as const;

/** Arquivos de outros formatos, que a API recusa. O HEIC é só o cabeçalho do formato. */
export const OtherFormatFixture = {
  PNG: 'photo.png',
  WEBP: 'photo.webp',
  HEIC: 'photo.heic',
} as const;

const FIXTURES_DIR = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures');

export function readFixture(name: string): Uint8Array {
  const buffer = readFileSync(join(FIXTURES_DIR, name));

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Os padrões de `REPORT_PHOTO_MAX_BYTES` e `REPORT_THUMBNAIL_MAX_BYTES`. */
export const DEFAULT_IMAGE_LIMITS: ReportImageLimits = {
  photoMaxBytes: 2 * 1024 * 1024,
  thumbnailMaxBytes: 100 * 1024,
};

/** O padrão de `REPORT_AREA_BOUNDS`: a caixa em volta de Campo Mourão. */
export const CAMPO_MOURAO_BOUNDS: ReportAreaBounds = {
  minLatitude: -24.3,
  minLongitude: -52.65,
  maxLatitude: -23.8,
  maxLongitude: -52.11,
};

/** A área padrão, com a precisão de até 50 m (`REPORT_MAX_ACCURACY_METERS`). */
export const CAMPO_MOURAO_AREA = ReportArea.create({
  bounds: CAMPO_MOURAO_BOUNDS,
  maxAccuracyMeters: 50,
});

/** A configuração com os padrões das variáveis de ambiente. */
export const TEST_REPORTS_CONFIG: ReportsConfig = {
  areaBounds: CAMPO_MOURAO_BOUNDS,
  maxAccuracyMeters: 50,
  imageLimits: DEFAULT_IMAGE_LIMITS,
  dailyLimit: 10,
  confirmationsRequired: 10,
  rejectionsRequired: 10,
  voteMaxDistanceMeters: 500,
};

/** Um ponto no centro de Campo Mourão. */
export const CENTER: GeoPointInput = { latitude: -24.045812, longitude: -52.378901 };

const WGS84_SEMI_MAJOR_AXIS = 6_378_137;
const WGS84_ECCENTRICITY_SQUARED = 0.00669437999014;

/**
 * Ponto a `meters` ao norte (negativo, ao sul) do informado, no elipsoide do WGS 84, como o
 * MySQL mede. Usa o raio de curvatura do meridiano, que nessas distâncias erra menos de 1 cm.
 */
export function pointNorthOf(point: GeoPointInput, meters: number): GeoPointInput {
  const latitude = (point.latitude * Math.PI) / 180;
  const meridianRadius =
    (WGS84_SEMI_MAJOR_AXIS * (1 - WGS84_ECCENTRICITY_SQUARED)) /
    (1 - WGS84_ECCENTRICITY_SQUARED * Math.sin(latitude) ** 2) ** 1.5;

  return {
    latitude: point.latitude + ((meters / meridianRadius) * 180) / Math.PI,
    longitude: point.longitude,
  };
}

export function buildPhoto(
  content: string = JpegFixture.PHOTO,
  thumbnail: string = JpegFixture.THUMBNAIL,
): ReportPhoto {
  return ReportPhoto.create(
    { content: readFixture(content), thumbnail: readFixture(thumbnail) },
    DEFAULT_IMAGE_LIMITS,
  );
}

interface OpenTestReportInput {
  authorId?: string;
  description?: string;
  location?: Partial<GeoLocationInput>;
  photo?: ReportPhoto;
  idempotencyKey?: string | null;
}

/** Reporte aberto em Campo Mourão, com a foto das fixtures. */
export function openTestReport(input: OpenTestReportInput = {}): Report {
  return Report.open({
    authorId: input.authorId ?? 'author-1',
    description: ReportDescription.create(input.description ?? 'Buraco na faixa da direita.'),
    location: GeoLocation.create({ ...CENTER, accuracyMeters: 8.5, ...input.location }),
    photo: input.photo ?? buildPhoto(),
    idempotencyKey: input.idempotencyKey ?? null,
    area: CAMPO_MOURAO_AREA,
  });
}

/**
 * O mesmo reporte com outros dados, como os que só a validação comunitária muda (o status e as
 * contagens dos votos).
 */
export function withReportChanges(report: Report, changes: Partial<ReportProps>): Report {
  return Report.restore(report.id, {
    authorId: report.authorId,
    status: report.status,
    description: report.description,
    location: report.location,
    photo: report.photo,
    confirmationsCount: report.confirmationsCount,
    rejectionsCount: report.rejectionsCount,
    idempotencyKey: report.idempotencyKey,
    statusChangedAt: report.statusChangedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    deletedAt: report.deletedAt,
    ...changes,
  });
}
