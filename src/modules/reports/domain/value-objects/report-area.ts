import { InaccurateLocationError } from '../errors/inaccurate-location.error';
import { LocationOutsideAreaError } from '../errors/location-outside-area.error';
import { GeoLocation } from './geo-location';
import { GeoPoint } from './geo-point';

/** Caixa de coordenadas, em graus decimais. Os limites fazem parte da caixa. */
export interface ReportAreaBounds {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
}

interface ReportAreaInput {
  /** `REPORT_AREA_BOUNDS`. */
  bounds: ReportAreaBounds;
  /** `REPORT_MAX_ACCURACY_METERS`. */
  maxAccuracyMeters: number;
}

/**
 * Área atendida pela aplicação (RN28): a caixa em volta de Campo Mourão e a pior precisão
 * aceita para a localização. Os dois valores vêm da configuração, que já os valida.
 */
export class ReportArea {
  private constructor(
    readonly bounds: Readonly<ReportAreaBounds>,
    readonly maxAccuracyMeters: number,
  ) {}

  static create({ bounds, maxAccuracyMeters }: ReportAreaInput): ReportArea {
    return new ReportArea({ ...bounds }, maxAccuracyMeters);
  }

  contains(point: GeoPoint): boolean {
    const { minLatitude, minLongitude, maxLatitude, maxLongitude } = this.bounds;

    return (
      point.latitude >= minLatitude &&
      point.latitude <= maxLatitude &&
      point.longitude >= minLongitude &&
      point.longitude <= maxLongitude
    );
  }

  /**
   * Confere a localização de um reporte novo. A precisão vem antes da área: com a precisão ruim,
   * o ponto pode estar longe de onde o aparelho realmente está.
   */
  ensureAccepts(location: GeoLocation): void {
    if (location.accuracyMeters > this.maxAccuracyMeters) {
      throw new InaccurateLocationError();
    }

    if (!this.contains(location.point)) {
      throw new LocationOutsideAreaError();
    }
  }
}
