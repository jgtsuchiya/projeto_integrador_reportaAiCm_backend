import { encodeBase64 } from '@shared/application/encoding/base64';

import { photoRules, thumbnailRules } from '../../domain/value-objects/report-image';
import {
  DEFAULT_IMAGE_LIMITS,
  JpegFixture,
  OtherFormatFixture,
  readFixture,
} from '../../testing/report-fixtures';
import { base64JpegSchema, reportPhotoSchema, reportsBodyLimitBytes } from './report-photo.dto';

describe('base64JpegSchema', () => {
  const sut = base64JpegSchema(photoRules(DEFAULT_IMAGE_LIMITS));

  function messageOf(value: unknown): string | undefined {
    return sut.safeParse(value).error?.issues[0]?.message;
  }

  it('deve aceitar o JPEG em base64 e devolver os bytes decodificados', () => {
    const bytes = readFixture(JpegFixture.PHOTO);

    expect(sut.parse(encodeBase64(bytes))).toEqual(bytes);
  });

  it.each([
    [
      'com o prefixo data:',
      `data:image/jpeg;base64,${encodeBase64(readFixture(JpegFixture.PHOTO))}`,
    ],
    ['com um caractere inválido', '/9j/4AAQ*kZJRgA='],
    ['sem o "=" do fim', encodeBase64(readFixture(JpegFixture.PHOTO)).replace(/=+$/, '')],
  ])('deve recusar o base64 %s, com a mensagem da imagem', (_case, value) => {
    expect(messageOf(value)).toBe('A foto precisa estar em base64, sem o prefixo "data:".');
  });

  it.each([
    ['um PNG', OtherFormatFixture.PNG],
    ['um WebP', OtherFormatFixture.WEBP],
    ['um HEIC', OtherFormatFixture.HEIC],
  ])('deve recusar %s com a mensagem do domínio', (_case, fixture) => {
    expect(messageOf(encodeBase64(readFixture(fixture)))).toBe(
      'A foto precisa ser uma imagem JPEG.',
    );
  });

  it('deve recusar a imagem acima do limite com a mensagem do domínio', () => {
    const schema = base64JpegSchema({ ...photoRules(DEFAULT_IMAGE_LIMITS), maxBytes: 1024 });

    const result = schema.safeParse(encodeBase64(readFixture(JpegFixture.PHOTO)));

    expect(result.error?.issues[0]?.message).toBe('A foto passa de 1 KB.');
  });

  it('deve usar as mensagens da miniatura', () => {
    const schema = base64JpegSchema(thumbnailRules(DEFAULT_IMAGE_LIMITS));

    expect(schema.safeParse('não é base64').error?.issues[0]?.message).toBe(
      'A miniatura precisa estar em base64, sem o prefixo "data:".',
    );
  });

  it('deve recusar o que não é texto sem tentar decodificar', () => {
    expect(sut.safeParse(42).success).toBe(false);
  });

  it('não deve repetir o base64 em nenhuma mensagem', () => {
    const value = encodeBase64(readFixture(OtherFormatFixture.PNG));

    expect(JSON.stringify(sut.safeParse(value).error?.issues)).not.toContain(value.slice(0, 16));
  });
});

describe('reportPhotoSchema', () => {
  it('deve validar a foto e a miniatura, cada uma no próprio campo', () => {
    const result = reportPhotoSchema(DEFAULT_IMAGE_LIMITS).safeParse({
      content: encodeBase64(readFixture(OtherFormatFixture.PNG)),
      thumbnail: 'inválido',
    });

    expect(result.error?.issues.map(({ path }) => path.join('.'))).toEqual([
      'content',
      'thumbnail',
    ]);
  });
});

describe('reportsBodyLimitBytes', () => {
  it('deve somar as duas imagens em base64 e a folga do resto do corpo: perto de 3 MB', () => {
    const result = reportsBodyLimitBytes(DEFAULT_IMAGE_LIMITS);

    expect(result).toBe(2796204 + 136536 + 16 * 1024);
    expect(result).toBeGreaterThan(2.8 * 1024 * 1024);
    expect(result).toBeLessThan(3 * 1024 * 1024);
  });
});
