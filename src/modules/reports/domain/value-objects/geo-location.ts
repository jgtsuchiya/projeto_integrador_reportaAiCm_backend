import { InvalidLocationError } from '../errors/invalid-location.error';
import { GeoPoint, GeoPointInput } from './geo-point';

export interface GeoLocationInput extends GeoPointInput {
  /** Precisão informada pelo aparelho, em metros. */
  accuracyMeters: number;
}

/**
 * Localização informada pelo aparelho: o ponto e a precisão, que é o raio em metros em volta
 * do ponto onde o aparelho garante estar. A precisão é arredondada para cima.
 */
export class GeoLocation {
  private constructor(
    readonly point: GeoPoint,
    readonly accuracyMeters: number,
  ) {}

  static create(input: GeoLocationInput): GeoLocation {
    const point = GeoPoint.create(input);

    if (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters <= 0) {
      throw new InvalidLocationError(
        'accuracyMeters',
        'A precisão deve ser um número de metros maior que zero.',
      );
    }

    return new GeoLocation(point, Math.ceil(input.accuracyMeters));
  }

  get latitude(): number {
    return this.point.latitude;
  }

  get longitude(): number {
    return this.point.longitude;
  }

  /** Distância em metros até o outro ponto, por haversine (`GeoPoint.distanceTo`). */
  distanceTo(other: GeoLocation | GeoPoint): number {
    return this.point.distanceTo(other instanceof GeoLocation ? other.point : other);
  }

  equals(other?: GeoLocation): boolean {
    return (
      other instanceof GeoLocation &&
      other.point.equals(this.point) &&
      other.accuracyMeters === this.accuracyMeters
    );
  }
}
