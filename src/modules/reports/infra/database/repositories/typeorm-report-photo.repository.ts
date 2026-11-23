import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ReportPhotoContent,
  ReportPhotoRepository,
  ReportPhotoSize,
} from '../../../domain/repositories/report-photo.repository';
import { ReportPhotoOrmEntity } from '../entities/report-photo.orm-entity';

/** Lê uma imagem da foto por vez: as colunas delas usam `select: false`. */
@Injectable()
export class TypeOrmReportPhotoRepository implements ReportPhotoRepository {
  constructor(
    @InjectRepository(ReportPhotoOrmEntity)
    private readonly repository: Repository<ReportPhotoOrmEntity>,
  ) {}

  async findContent(reportId: string, size: ReportPhotoSize): Promise<ReportPhotoContent | null> {
    const column = size === ReportPhotoSize.THUMBNAIL ? 'thumbnail' : 'content';
    const entity = await this.repository
      .createQueryBuilder('photo')
      .select(['photo.id', 'photo.mimeType'])
      .addSelect(`photo.${column}`)
      .where('photo.reportId = :reportId', { reportId })
      .getOne();

    if (!entity) {
      return null;
    }

    const buffer = entity[column];

    return {
      photoId: entity.id,
      mimeType: entity.mimeType,
      bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    };
  }
}
