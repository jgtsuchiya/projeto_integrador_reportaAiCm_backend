import {
  DEFAULT_IMAGE_LIMITS,
  JpegFixture,
  OtherFormatFixture,
  readFixture,
} from '../../testing/report-fixtures';
import { InvalidReportImageError } from '../errors/invalid-report-image.error';
import {
  JPEG_MIME_TYPE,
  photoRules,
  REPORT_PHOTO_MAX_DIMENSION,
  REPORT_THUMBNAIL_MAX_DIMENSION,
  ReportImage,
  ReportImageKind,
  ReportImageRules,
  thumbnailRules,
} from './report-image';

const PHOTO_RULES = photoRules(DEFAULT_IMAGE_LIMITS);
const THUMBNAIL_RULES = thumbnailRules(DEFAULT_IMAGE_LIMITS);

/** Marcadores dos segmentos do cabeçalho, do primeiro depois do SOI até o SOS. */
function headerMarkers(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let offset = 2;

  while (offset < bytes.length) {
    const marker = bytes[offset + 1];
    markers.push(marker);
    if (marker === 0xda) {
      break;
    }
    offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
  }

  return markers;
}

/** Bytes a partir do SOS: os dados comprimidos da imagem. */
function scanData(bytes: Uint8Array): Uint8Array {
  let offset = 2;

  while (bytes[offset + 1] !== 0xda) {
    offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
  }

  return bytes.subarray(offset);
}

/** Cópia do JPEG com outras dimensões no SOF, para testar os limites sem gerar outra imagem. */
function withDimensions(bytes: Uint8Array, width: number, height: number): Uint8Array {
  const copy = Uint8Array.from(bytes);
  let offset = 2;

  while (copy[offset + 1] !== 0xc0 && copy[offset + 1] !== 0xc2) {
    offset += 2 + ((copy[offset + 2] << 8) | copy[offset + 3]);
  }
  copy.set([height >> 8, height & 0xff, width >> 8, width & 0xff], offset + 5);

  return copy;
}

/** JPEG mínimo montado à mão: SOI, os segmentos informados e EOI. */
function handmadeJpeg(...segments: number[][]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xd9]);
}

// Quadro de 32 × 16 com um componente, e o início dos dados com dois bytes comprimidos.
const SOF0 = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00];
const SOS = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34];

describe('ReportImage', () => {
  it.each([
    ['baseline', JpegFixture.PHOTO, 160, 120],
    ['progressivo', JpegFixture.PROGRESSIVE, 200, 150],
  ])('deve ler as dimensões de um JPEG %s', (_case, fixture, width, height) => {
    const sut = ReportImage.create(readFixture(fixture), PHOTO_RULES);

    expect(sut).toMatchObject({ width, height, mimeType: JPEG_MIME_TYPE });
  });

  it('deve manter os bytes de um JPEG sem metadados', () => {
    const bytes = readFixture(JpegFixture.PHOTO);

    const sut = ReportImage.create(bytes, PHOTO_RULES);

    expect(sut.bytes).toEqual(bytes);
    expect(sut.sizeBytes).toBe(bytes.length);
  });

  describe('com metadados', () => {
    const original = readFixture(JpegFixture.WITH_METADATA);

    it('deve tirar o EXIF e o XMP (APP1) e o IPTC (APP13), e manter o JFIF e o perfil de cor', () => {
      const sut = ReportImage.create(original, PHOTO_RULES);

      expect(headerMarkers(original)).toEqual(expect.arrayContaining([0xe1, 0xed]));
      expect(headerMarkers(sut.bytes)).not.toContain(0xe1);
      expect(headerMarkers(sut.bytes)).not.toContain(0xed);
      expect(headerMarkers(sut.bytes)).toEqual(expect.arrayContaining([0xe0, 0xe2]));
      expect(sut.sizeBytes).toBeLessThan(original.length);
    });

    it('deve continuar sendo uma imagem: os mesmos dados comprimidos e as mesmas dimensões', () => {
      const sut = ReportImage.create(original, PHOTO_RULES);

      expect(scanData(sut.bytes)).toEqual(scanData(original));
      expect(ReportImage.create(sut.bytes, PHOTO_RULES)).toMatchObject({
        width: 160,
        height: 120,
      });
    });

    it('deve tirar o texto do GPS e do autor junto com os segmentos', () => {
      const text = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

      const sut = ReportImage.create(original, PHOTO_RULES);

      expect(text(original)).toContain('GPSLatitude');
      expect(text(original)).toContain('Fulano de Tal');
      expect(text(sut.bytes)).not.toContain('GPSLatitude');
      expect(text(sut.bytes)).not.toContain('Fulano de Tal');
    });
  });

  describe('recusas', () => {
    const notJpeg = 'A foto precisa ser uma imagem JPEG.';

    it.each([
      ['um PNG', readFixture(OtherFormatFixture.PNG)],
      ['um WebP', readFixture(OtherFormatFixture.WEBP)],
      ['um HEIC', readFixture(OtherFormatFixture.HEIC)],
      ['um JPEG cortado', readFixture(JpegFixture.PHOTO).subarray(0, 1000)],
      ['um texto', new TextEncoder().encode('não é uma imagem')],
      ['nada', new Uint8Array()],
    ])('deve recusar %s', (_case, bytes) => {
      expect(() => ReportImage.create(bytes, PHOTO_RULES)).toThrow(notJpeg);
    });

    it.each([
      ['o SOS antes do SOF', handmadeJpeg(SOS)],
      ['um segmento maior que o arquivo', handmadeJpeg([0xff, 0xe0, 0x10, 0x00, 0x00], SOS)],
      ['um segmento sem o tamanho', handmadeJpeg([0xff, 0xc0])],
      ['um tamanho menor que 2', handmadeJpeg([0xff, 0xe0, 0x00, 0x01], SOF0, SOS)],
      ['um SOF curto', handmadeJpeg([0xff, 0xc0, 0x00, 0x04, 0x08, 0x00], SOS)],
      [
        'largura zero',
        handmadeJpeg(
          SOF0.map((b, i) => (i === 7 || i === 8 ? 0 : b)),
          SOS,
        ),
      ],
      ['um byte fora de marcador', handmadeJpeg([0x00], SOF0, SOS)],
      ['um segundo SOI', handmadeJpeg([0xff, 0xd8], SOF0, SOS)],
      ['o EOI antes dos dados', handmadeJpeg(SOF0, [0xff, 0xd9], SOS)],
      ['um marcador inválido', handmadeJpeg([0xff, 0x00], SOF0, SOS)],
      ['só o cabeçalho, sem os dados', handmadeJpeg(SOF0)],
      ['só preenchimento depois do cabeçalho', Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xd9])],
    ])('deve recusar a estrutura com %s', (_case, bytes) => {
      expect(() => ReportImage.create(bytes, PHOTO_RULES)).toThrow(notJpeg);
    });

    it('deve aceitar o JPEG montado à mão, com preenchimento e marcadores sem tamanho', () => {
      const bytes = handmadeJpeg([0xff], SOF0, [0xff, 0xd0], SOS);

      expect(ReportImage.create(bytes, PHOTO_RULES)).toMatchObject({ width: 32, height: 16 });
    });

    it('deve recusar a foto maior que o limite, dizendo o limite', () => {
      const rules: ReportImageRules = { ...PHOTO_RULES, maxBytes: 1024 };

      expect(() => ReportImage.create(readFixture(JpegFixture.PHOTO), rules)).toThrow(
        'A foto passa de 1 KB.',
      );
    });

    it('deve dizer o formato antes do tamanho', () => {
      const rules: ReportImageRules = { ...PHOTO_RULES, maxBytes: 10 };

      expect(() => ReportImage.create(readFixture(OtherFormatFixture.PNG), rules)).toThrow(notJpeg);
    });

    it.each([
      ['a largura', REPORT_PHOTO_MAX_DIMENSION + 1, 100],
      ['a altura', 100, REPORT_PHOTO_MAX_DIMENSION + 1],
    ])('deve recusar a foto com %s acima de 2048 px', (_case, width, height) => {
      const bytes = withDimensions(readFixture(JpegFixture.PHOTO), width, height);

      expect(() => ReportImage.create(bytes, PHOTO_RULES)).toThrow(
        'A foto passa de 2048 px no maior lado.',
      );
    });

    it('deve aceitar a foto com o maior lado em 2048 px', () => {
      const bytes = withDimensions(readFixture(JpegFixture.PHOTO), 2048, 1536);

      expect(ReportImage.create(bytes, PHOTO_RULES)).toMatchObject({ width: 2048, height: 1536 });
    });

    it('deve usar as mensagens da miniatura', () => {
      const bytes = withDimensions(readFixture(JpegFixture.THUMBNAIL), 481, 360);

      expect(() => ReportImage.create(bytes, THUMBNAIL_RULES)).toThrow(
        'A miniatura passa de 480 px no maior lado.',
      );
      expect(() => ReportImage.create(new Uint8Array(), THUMBNAIL_RULES)).toThrow(
        'A miniatura precisa ser uma imagem JPEG.',
      );
    });

    it.each([
      [PHOTO_RULES, 'photo.content'],
      [THUMBNAIL_RULES, 'photo.thumbnail'],
    ])('deve informar o campo da imagem nos detalhes do erro', (rules, field) => {
      let failure: unknown;

      try {
        ReportImage.create(new Uint8Array(), rules);
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(InvalidReportImageError);
      expect(failure).toMatchObject({ details: { field } });
    });
  });

  it('deve montar as regras da foto e da miniatura com os limites da configuração', () => {
    expect(photoRules({ photoMaxBytes: 10, thumbnailMaxBytes: 5 })).toEqual({
      kind: ReportImageKind.PHOTO,
      maxBytes: 10,
      maxDimension: REPORT_PHOTO_MAX_DIMENSION,
    });
    expect(thumbnailRules({ photoMaxBytes: 10, thumbnailMaxBytes: 5 })).toEqual({
      kind: ReportImageKind.THUMBNAIL,
      maxBytes: 5,
      maxDimension: REPORT_THUMBNAIL_MAX_DIMENSION,
    });
  });
});
