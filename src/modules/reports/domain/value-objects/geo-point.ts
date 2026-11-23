import { InvalidLocationError } from '../errors/invalid-location.error';

/** Raio médio da Terra (IUGG), usado na distância por haversine. */
export const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;

export interface GeoPointInput {
  latitude: number;
  longitude: number;
}

/** Ponto nas coordenadas do GPS (WGS 84), em graus decimais. */
export class GeoPoint {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static create({ latitude, longitude }: GeoPointInput): GeoPoint {
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
      throw new InvalidLocationError('latitude', 'A latitude deve estar entre -90 e 90.');
    }

    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      throw new InvalidLocationError('longitude', 'A longitude deve estar entre -180 e 180.');
    }

    return new GeoPoint(latitude, longitude);
  }

  /**
   * Distância em metros pela fórmula de haversine, na esfera com o raio médio da Terra. O MySQL
   * calcula no elipsoide do WGS 84: entre os dois, a diferença fica abaixo de 0,5%.
   */
  distanceTo(other: GeoPoint): number {
    const latitude = toRadians(this.latitude);
    const otherLatitude = toRadians(other.latitude);
    const halfDeltaLatitude = (otherLatitude - latitude) / 2;
    const halfDeltaLongitude = toRadians(other.longitude - this.longitude) / 2;
    const haversine =
      Math.sin(halfDeltaLatitude) ** 2 +
      Math.cos(latitude) * Math.cos(otherLatitude) * Math.sin(halfDeltaLongitude) ** 2;

    return 2 * EARTH_MEAN_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
  }

  equals(other?: GeoPoint): boolean {
    return (
      other instanceof GeoPoint &&
      other.latitude === this.latitude &&
      other.longitude === this.longitude
    );
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
