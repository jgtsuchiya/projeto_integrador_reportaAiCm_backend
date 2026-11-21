import { CENTER, pointNorthOf } from '../../testing/report-fixtures';
import { InaccurateLocationError } from '../errors/inaccurate-location.error';
import { VoterTooFarError } from '../errors/voter-too-far.error';
import { GeoLocation } from './geo-location';
import { VotingRange } from './voting-range';

describe('VotingRange', () => {
  const sut = VotingRange.create({ maxDistanceMeters: 500, maxAccuracyMeters: 50 });
  const report = GeoLocation.create({ ...CENTER, accuracyMeters: 9 });

  function voterAt(meters: number, accuracyMeters = 12): GeoLocation {
    return GeoLocation.create({ ...pointNorthOf(CENTER, meters), accuracyMeters });
  }

  it.each([0, 100, 490])('deve aceitar quem vota a %i m do reporte', (meters) => {
    expect(() => sut.ensureReaches(voterAt(meters), report)).not.toThrow();
  });

  it('deve recusar quem vota a 600 m, com o limite na mensagem', () => {
    expect(() => sut.ensureReaches(voterAt(600), report)).toThrow(
      new VoterTooFarError(500).message,
    );
    expect(() => sut.ensureReaches(voterAt(600), report)).toThrow(VoterTooFarError);
  });

  it('deve recusar a localização imprecisa antes de medir a distância', () => {
    expect(() => sut.ensureReaches(voterAt(600, 51), report)).toThrow(InaccurateLocationError);
    expect(() => sut.ensureReaches(voterAt(0, 50), report)).not.toThrow();
  });

  it('deve cobrir a distância até o limite, inclusive', () => {
    expect(sut.covers(500)).toBe(true);
    expect(sut.covers(500.1)).toBe(false);
  });
});
