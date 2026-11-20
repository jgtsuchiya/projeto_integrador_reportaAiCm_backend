import { encodeBase64 } from '@shared/application/encoding/base64';

import { DEFAULT_IMAGE_LIMITS, JpegFixture, readFixture } from '../../testing/report-fixtures';
import {
  editReportBodySchema,
  idempotencyKeySchema,
  listMyReportsQuerySchema,
  nearbyReportsQuerySchema,
  openReportBodySchema,
  reportPhotoQuerySchema,
} from './report.dto';

const photo = {
  content: encodeBase64(readFixture(JpegFixture.PHOTO)),
  thumbnail: encodeBase64(readFixture(JpegFixture.THUMBNAIL)),
};

/** Campos com erro, no formato do `details` (`photo.content`). */
function failedFields(result: { error?: { issues: Array<{ path: PropertyKey[] }> } }): string[] {
  return result.error?.issues.map(({ path }) => path.map(String).join('.')) ?? [];
}

describe('openReportBodySchema', () => {
  const sut = openReportBodySchema(DEFAULT_IMAGE_LIMITS);
  const body = {
    description: 'Buraco grande.',
    location: { latitude: -24.045812, longitude: -52.378901, accuracyMeters: 8.5 },
    photo,
  };

  it('deve aceitar o corpo do plano e entregar as imagens em bytes', () => {
    const result = sut.parse(body);

    expect(result).toEqual({
      description: 'Buraco grande.',
      location: body.location,
      photo: {
        content: readFixture(JpegFixture.PHOTO),
        thumbnail: readFixture(JpegFixture.THUMBNAIL),
      },
    });
  });

  it.each([undefined, null, ''])('deve aceitar a descrição %p', (description) => {
    expect(sut.safeParse({ ...body, description }).success).toBe(true);
  });

  it('deve informar todos os campos inválidos de uma vez', () => {
    const result = sut.safeParse({
      description: 'a'.repeat(501),
      location: { latitude: -91, longitude: 181, accuracyMeters: 0 },
      photo: { content: 'data:image/jpeg;base64,abc', thumbnail: 'abc' },
    });

    expect(failedFields(result)).toEqual([
      'description',
      'location.latitude',
      'location.longitude',
      'location.accuracyMeters',
      'photo.content',
      'photo.thumbnail',
    ]);
  });

  it('deve exigir a localização e a foto', () => {
    expect(failedFields(sut.safeParse({}))).toEqual(['location', 'photo']);
  });
});

describe('editReportBodySchema', () => {
  const sut = editReportBodySchema(DEFAULT_IMAGE_LIMITS);

  it('deve aceitar só a descrição, só a foto ou as duas', () => {
    expect(sut.parse({ description: '' })).toEqual({ description: '' });
    expect(sut.safeParse({ photo }).success).toBe(true);
    expect(sut.safeParse({ description: null, photo }).success).toBe(true);
  });

  it('deve exigir pelo menos um campo e ignorar a localização', () => {
    const result = sut.safeParse({ location: { latitude: 0, longitude: 0, accuracyMeters: 1 } });

    expect(result.error?.issues[0]?.message).toBe('Informe a descrição ou a foto.');
  });
});

describe('idempotencyKeySchema', () => {
  it('deve aceitar um UUID, em minúsculas, ou nada', () => {
    expect(idempotencyKeySchema.parse('8F0E2C4A-6B1D-4C7E-9A52-3D6F1E0B7A91')).toBe(
      '8f0e2c4a-6b1d-4c7e-9a52-3d6f1e0b7a91',
    );
    expect(idempotencyKeySchema.parse(undefined)).toBeUndefined();
  });

  it.each(['', 'chave-1', '8f0e2c4a6b1d4c7e9a523d6f1e0b7a91'])('deve recusar %p', (key) => {
    expect(idempotencyKeySchema.safeParse(key).error?.issues[0]?.message).toBe(
      'A Idempotency-Key deve ser um UUID.',
    );
  });
});

describe('listMyReportsQuerySchema', () => {
  it('deve aplicar a paginação padrão e aceitar o filtro de status', () => {
    expect(listMyReportsQuerySchema.parse({ status: 'REJECTED' })).toEqual({
      page: 1,
      pageSize: 20,
      status: 'REJECTED',
    });
  });

  it('deve recusar um status que não existe', () => {
    expect(listMyReportsQuerySchema.safeParse({ status: 'DONE' }).success).toBe(false);
  });
});

describe('nearbyReportsQuerySchema', () => {
  it('deve converter a query e aplicar o raio padrão', () => {
    expect(nearbyReportsQuerySchema.parse({ latitude: '-24.04', longitude: ' -52.37 ' })).toEqual({
      latitude: -24.04,
      longitude: -52.37,
      radiusMeters: 1000,
    });
  });

  it.each([
    ['sem a latitude', { longitude: '-52' }, 'latitude', 'Informe a latitude.'],
    ['com a latitude vazia', { latitude: '', longitude: '-52' }, 'latitude', 'Informe a latitude.'],
    [
      'com a latitude fora da faixa',
      { latitude: '-91', longitude: '-52' },
      'latitude',
      'A latitude deve estar entre -90 e 90.',
    ],
    [
      'com a longitude em texto',
      { latitude: '-24', longitude: 'oeste' },
      'longitude',
      'A longitude deve ser um número.',
    ],
    [
      'com o raio acima de 5000',
      { latitude: '-24', longitude: '-52', radiusMeters: '5001' },
      'radiusMeters',
      'O raio deve ser de 10 a 5000 metros.',
    ],
    [
      'com o raio abaixo de 10',
      { latitude: '-24', longitude: '-52', radiusMeters: '9' },
      'radiusMeters',
      'O raio deve ser de 10 a 5000 metros.',
    ],
    [
      'com o raio fracionado',
      { latitude: '-24', longitude: '-52', radiusMeters: '10.5' },
      'radiusMeters',
      'O raio deve ser de 10 a 5000 metros.',
    ],
  ])('deve recusar a query %s', (_case, query, field, message) => {
    const result = nearbyReportsQuerySchema.safeParse(query);

    expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
  });
});

describe('reportPhotoQuerySchema', () => {
  it('deve usar a foto inteira por padrão e aceitar a miniatura', () => {
    expect(reportPhotoQuerySchema.parse({})).toEqual({ size: 'full' });
    expect(reportPhotoQuerySchema.parse({ size: 'thumbnail' })).toEqual({ size: 'thumbnail' });
    expect(reportPhotoQuerySchema.safeParse({ size: 'large' }).success).toBe(false);
  });
});
