import { InaccurateLocationError } from '../errors/inaccurate-location.error';
import { VoterTooFarError } from '../errors/voter-too-far.error';
import { GeoLocation } from './geo-location';

interface VotingRangeInput {
  /** `REPORT_VOTE_MAX_DISTANCE_METERS`. */
  maxDistanceMeters: number;
  /** `REPORT_MAX_ACCURACY_METERS`, a mesma da abertura. */
  maxAccuracyMeters: number;
}

/**
 * Até onde vale o voto (RN38): quem vota precisa estar perto do reporte, com uma localização
 * precisa. Os dois valores vêm da configuração, que já os valida. A localização de quem vota só
 * é conferida aqui: ela não é gravada.
 */
export class VotingRange {
  private constructor(
    readonly maxDistanceMeters: number,
    readonly maxAccuracyMeters: number,
  ) {}

  static create({ maxDistanceMeters, maxAccuracyMeters }: VotingRangeInput): VotingRange {
    return new VotingRange(maxDistanceMeters, maxAccuracyMeters);
  }

  /** Se a distância, em metros, entre quem vota e o reporte está no alcance. */
  covers(distanceMeters: number): boolean {
    return distanceMeters <= this.maxDistanceMeters;
  }

  /**
   * Confere a localização de quem vota. A precisão vem antes da distância, como na abertura:
   * com a precisão ruim, o ponto pode estar longe de onde o aparelho realmente está.
   */
  ensureReaches(voterLocation: GeoLocation, reportLocation: GeoLocation): void {
    if (voterLocation.accuracyMeters > this.maxAccuracyMeters) {
      throw new InaccurateLocationError();
    }

    if (!this.covers(voterLocation.distanceTo(reportLocation))) {
      throw new VoterTooFarError(this.maxDistanceMeters);
    }
  }
}
