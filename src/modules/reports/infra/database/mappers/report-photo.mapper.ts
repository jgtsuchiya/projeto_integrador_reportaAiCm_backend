import { ReportPhoto } from '../../../domain/entities/report-photo.entity';
import { ReportPhotoOrmEntity } from '../entities/report-photo.orm-entity';

/**
 * Só existe o caminho de ida: as imagens são lidas uma de cada vez, pelo
 * `ReportPhotoRepository.findContent`, e os dados da foto, junto com o reporte.
 */
export class ReportPhotoMapper {
  static toPersistence(photo: ReportPhoto, reportId: string): ReportPhotoOrmEntity {
    const entity = new ReportPhotoOrmEntity();
    entity.id = photo.id;
    entity.reportId = reportId;
    entity.mimeType = photo.mimeType;
    entity.width = photo.width;
    entity.height = photo.height;
    entity.sizeBytes = photo.sizeBytes;
    entity.content = toBuffer(photo.content.bytes);
    entity.thumbnail = toBuffer(photo.thumbnail.bytes);
    entity.createdAt = photo.createdAt;

    return entity;
  }
}

/** O driver do MySQL grava o BLOB a partir de um Buffer. A conversão não copia os bytes. */
function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
