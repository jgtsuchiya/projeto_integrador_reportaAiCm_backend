import {
  DEFAULT_IMAGE_LIMITS,
  JpegFixture,
  OtherFormatFixture,
  readFixture,
} from '../../testing/report-fixtures';
import { InvalidReportImageError } from '../errors/invalid-report-image.error';
import { JPEG_MIME_TYPE } from '../value-objects/report-image';
import { ReportPhoto } from './report-photo.entity';

describe('ReportPhoto', () => {
  const content = readFixture(JpegFixture.WITH_METADATA);
  const thumbnail = readFixture(JpegFixture.THUMBNAIL);

  it('deve criar a foto com a imagem e a miniatura conferidas e sem os metadados', () => {
    const sut = ReportPhoto.create({ content, thumbnail }, DEFAULT_IMAGE_LIMITS);

    expect(sut.id).toEqual(expect.any(String));
    expect(sut).toMatchObject({ width: 160, height: 120, mimeType: JPEG_MIME_TYPE });
    expect(sut.sizeBytes).toBeLessThan(content.length);
    expect(sut.sizeBytes).toBe(sut.content.sizeBytes);
    expect(sut.thumbnail).toMatchObject({ width: 48, height: 36 });
    expect(sut.createdAt).toBeInstanceOf(Date);
  });

  it('deve informar o id e as dimensões, sem as imagens', () => {
    const sut = ReportPhoto.create({ content, thumbnail }, DEFAULT_IMAGE_LIMITS);

    expect(sut.info).toEqual({ id: sut.id, width: 160, height: 120 });
  });

  it('deve ganhar um id novo a cada foto, para o app trocar o cache', () => {
    const first = ReportPhoto.create({ content, thumbnail }, DEFAULT_IMAGE_LIMITS);
    const second = ReportPhoto.create({ content, thumbnail }, DEFAULT_IMAGE_LIMITS);

    expect(second.id).not.toBe(first.id);
  });

  it('deve conferir cada imagem com o próprio limite', () => {
    const limits = { photoMaxBytes: DEFAULT_IMAGE_LIMITS.photoMaxBytes, thumbnailMaxBytes: 100 };

    expect(() => ReportPhoto.create({ content, thumbnail }, limits)).toThrow(
      'A miniatura passa de 100 bytes.',
    );
  });

  it('deve recusar a foto que não é um JPEG', () => {
    const png = readFixture(OtherFormatFixture.PNG);

    expect(() => ReportPhoto.create({ content: png, thumbnail }, DEFAULT_IMAGE_LIMITS)).toThrow(
      InvalidReportImageError,
    );
  });
});
