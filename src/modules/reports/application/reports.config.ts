import type { ReportAreaBounds } from '../domain/value-objects/report-area';
import type { ReportImageLimits } from '../domain/value-objects/report-image';

/**
 * Configuração dos reportes, lida das variáveis de ambiente pelo ReportsModule. Fica numa
 * classe própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class ReportsConfig {
  /** `REPORT_AREA_BOUNDS`. */
  abstract readonly areaBounds: ReportAreaBounds;
  /** `REPORT_MAX_ACCURACY_METERS`. */
  abstract readonly maxAccuracyMeters: number;
  /** `REPORT_PHOTO_MAX_BYTES` e `REPORT_THUMBNAIL_MAX_BYTES`. */
  abstract readonly imageLimits: ReportImageLimits;
  /** `REPORT_DAILY_LIMIT`. */
  abstract readonly dailyLimit: number;
  /** `REPORT_CONFIRMATIONS_REQUIRED`. */
  abstract readonly confirmationsRequired: number;
  /** `REPORT_REJECTIONS_REQUIRED`. */
  abstract readonly rejectionsRequired: number;
  /** `REPORT_VOTE_MAX_DISTANCE_METERS`. */
  abstract readonly voteMaxDistanceMeters: number;
}
