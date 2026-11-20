import { InvalidLocationError } from '../errors/invalid-location.error';
import { EARTH_MEAN_RADIUS_METERS, GeoPoint } from './geo-point';

describe('GeoPoint', () => {
  it('deve criar o ponto com a latitude e a longitude informadas', () => {
    const sut = GeoPoint.create({ latitude: -24.045812, longitude: -52.378901 });

    expect(sut).toMatchObject({ latitude: -24.045812, longitude: -52.378901 });
  });

  it.each([
    [90, 180],
    [-90, -180],
    [0, 0],
  ])('deve aceitar os limites da faixa: %p, %p', (latitude, longitude) => {
    expect(GeoPoint.create({ latitude, longitude })).toMatchObject({ latitude, longitude });
  });

  it.each([90.000001, -90.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'deve recusar a latitude %p',
    (latitude) => {
      expect(() => GeoPoint.create({ latitude, longitude: 0 })).toThrow(
        new InvalidLocationError('latitude', 'A latitude deve estar entre -90 e 90.'),
      );
    },
  );

  it.each([180.000001, -181, Number.NaN, Number.NEGATIVE_INFINITY])(
    'deve recusar a longitude %p',
    (longitude) => {
      expect(() => GeoPoint.create({ latitude: 0, longitude })).toThrow(
        'A longitude deve estar entre -180 e 180.',
      );
    },
  );

  describe('distanceTo', () => {
    it('deve medir um grau de latitude como 1/360 da circunferência média da Terra', () => {
      const sut = GeoPoint.create({ latitude: 0, longitude: 0 });

      const result = sut.distanceTo(GeoPoint.create({ latitude: 1, longitude: 0 }));

      expect(result).toBeCloseTo((2 * Math.PI * EARTH_MEAN_RADIUS_METERS) / 360, 3);
    });

    it('deve medir distâncias curtas em Campo Mourão, nos dois sentidos', () => {
      const a = GeoPoint.create({ latitude: -24.045812, longitude: -52.378901 });
      const b = GeoPoint.create({ latitude: -24.045903, longitude: -52.378766 });

      expect(a.distanceTo(b)).toBeCloseTo(17.04, 1);
      expect(b.distanceTo(a)).toBe(a.distanceTo(b));
    });

    it('deve medir zero até o próprio ponto', () => {
      const sut = GeoPoint.create({ latitude: -24, longitude: -52 });

      expect(sut.distanceTo(sut)).toBe(0);
    });

    it('deve medir meia volta entre pontos opostos sem passar de 1 no arco-seno', () => {
      const sut = GeoPoint.create({ latitude: 0, longitude: 0 });

      expect(sut.distanceTo(GeoPoint.create({ latitude: 0, longitude: 180 }))).toBeCloseTo(
        Math.PI * EARTH_MEAN_RADIUS_METERS,
        3,
      );
    });
  });

  it('deve ser igual a outro ponto com as mesmas coordenadas', () => {
    const sut = GeoPoint.create({ latitude: -24, longitude: -52 });

    expect(sut.equals(GeoPoint.create({ latitude: -24, longitude: -52 }))).toBe(true);
    expect(sut.equals(GeoPoint.create({ latitude: -24, longitude: -52.1 }))).toBe(false);
    expect(sut.equals(undefined)).toBe(false);
  });
});
