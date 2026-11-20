import { CAMPO_MOURAO_BOUNDS } from '../../testing/report-fixtures';
import { InaccurateLocationError } from '../errors/inaccurate-location.error';
import { LocationOutsideAreaError } from '../errors/location-outside-area.error';
import { GeoLocation } from './geo-location';
import { GeoPoint } from './geo-point';
import { ReportArea } from './report-area';

describe('ReportArea', () => {
  const sut = ReportArea.create({ bounds: CAMPO_MOURAO_BOUNDS, maxAccuracyMeters: 50 });

  function location(latitude: number, longitude: number, accuracyMeters = 10): GeoLocation {
    return GeoLocation.create({ latitude, longitude, accuracyMeters });
  }

  it.each([
    ['no centro', -24.045812, -52.378901],
    ['no canto sudoeste', -24.3, -52.65],
    ['no canto nordeste', -23.8, -52.11],
  ])('deve conter o ponto %s da caixa', (_case, latitude, longitude) => {
    expect(sut.contains(GeoPoint.create({ latitude, longitude }))).toBe(true);
  });

  it.each([
    ['ao sul', -24.31, -52.4],
    ['ao norte', -23.79, -52.4],
    ['a oeste', -24, -52.66],
    ['a leste', -24, -52.1],
    ['em outra cidade', -25.4284, -49.2733],
  ])('não deve conter o ponto %s da caixa', (_case, latitude, longitude) => {
    expect(sut.contains(GeoPoint.create({ latitude, longitude }))).toBe(false);
  });

  it('deve aceitar a localização dentro da caixa, com a precisão no limite', () => {
    expect(() => sut.ensureAccepts(location(-24.045812, -52.378901, 50))).not.toThrow();
  });

  it('deve recusar a localização com a precisão pior que a aceita', () => {
    expect(() => sut.ensureAccepts(location(-24.045812, -52.378901, 51))).toThrow(
      InaccurateLocationError,
    );
  });

  it('deve recusar a localização fora da caixa', () => {
    expect(() => sut.ensureAccepts(location(-25.4284, -49.2733))).toThrow(LocationOutsideAreaError);
  });

  it('deve recusar primeiro pela precisão: com ela ruim, o ponto pode estar errado', () => {
    expect(() => sut.ensureAccepts(location(-25.4284, -49.2733, 500))).toThrow(
      InaccurateLocationError,
    );
  });

  it('não deve ser alterada por quem passou a caixa', () => {
    const bounds = { ...CAMPO_MOURAO_BOUNDS };
    const area = ReportArea.create({ bounds, maxAccuracyMeters: 50 });

    bounds.maxLatitude = 0;

    expect(area.bounds.maxLatitude).toBe(CAMPO_MOURAO_BOUNDS.maxLatitude);
  });
});
