import { InvalidLocationError } from '../errors/invalid-location.error';
import { GeoLocation } from './geo-location';
import { GeoPoint } from './geo-point';

describe('GeoLocation', () => {
  const center = { latitude: -24.045812, longitude: -52.378901 };

  it('deve criar a localização com o ponto e a precisão', () => {
    const sut = GeoLocation.create({ ...center, accuracyMeters: 9 });

    expect(sut).toMatchObject({ ...center, accuracyMeters: 9 });
    expect(sut.point.equals(GeoPoint.create(center))).toBe(true);
  });

  it.each([
    [8.5, 9],
    [8, 8],
    [0.2, 1],
  ])('deve arredondar a precisão %p para cima: %p', (accuracyMeters, expected) => {
    expect(GeoLocation.create({ ...center, accuracyMeters }).accuracyMeters).toBe(expected);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'deve recusar a precisão %p',
    (accuracyMeters) => {
      expect(() => GeoLocation.create({ ...center, accuracyMeters })).toThrow(
        new InvalidLocationError(
          'accuracyMeters',
          'A precisão deve ser um número de metros maior que zero.',
        ),
      );
    },
  );

  it('deve conferir as coordenadas como o GeoPoint', () => {
    expect(() => GeoLocation.create({ latitude: -91, longitude: 0, accuracyMeters: 5 })).toThrow(
      InvalidLocationError,
    );
  });

  it('deve medir a distância até outra localização ou até um ponto', () => {
    const sut = GeoLocation.create({ ...center, accuracyMeters: 5 });
    const other = { latitude: -24.045903, longitude: -52.378766 };

    expect(sut.distanceTo(GeoLocation.create({ ...other, accuracyMeters: 30 }))).toBe(
      sut.point.distanceTo(GeoPoint.create(other)),
    );
    expect(sut.distanceTo(GeoPoint.create(other))).toBeCloseTo(17.04, 1);
  });

  it('deve ser igual a outra localização com o mesmo ponto e a mesma precisão', () => {
    const sut = GeoLocation.create({ ...center, accuracyMeters: 8.5 });

    expect(sut.equals(GeoLocation.create({ ...center, accuracyMeters: 9 }))).toBe(true);
    expect(sut.equals(GeoLocation.create({ ...center, accuracyMeters: 10 }))).toBe(false);
    expect(sut.equals(undefined)).toBe(false);
  });
});
