import { buildPhoto, JpegFixture } from '../../../testing/report-fixtures';
import { ReportPhotoOrmEntity } from '../entities/report-photo.orm-entity';
import { ReportPhotoMapper } from './report-photo.mapper';

describe('ReportPhotoMapper', () => {
  it('deve converter a foto para a persistência, com as imagens em Buffer', () => {
    const photo = buildPhoto(JpegFixture.WITH_METADATA);

    const entity = ReportPhotoMapper.toPersistence(photo, 'report-1');

    expect(entity).toBeInstanceOf(ReportPhotoOrmEntity);
    expect(entity).toMatchObject({
      id: photo.id,
      reportId: 'report-1',
      mimeType: 'image/jpeg',
      width: 160,
      height: 120,
      sizeBytes: photo.content.sizeBytes,
      createdAt: photo.createdAt,
    });
    expect(Buffer.isBuffer(entity.content)).toBe(true);
    expect(new Uint8Array(entity.content)).toEqual(photo.content.bytes);
    expect(new Uint8Array(entity.thumbnail)).toEqual(photo.thumbnail.bytes);
  });
});
