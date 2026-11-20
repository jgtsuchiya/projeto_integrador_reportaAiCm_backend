import { Column, CreateDateColumn, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';

import { CREATED_AT_COLUMN } from '@shared/infra/database/base.orm-entity';

import { ReportOrmEntity } from './report.orm-entity';

/**
 * Foto do reporte, em binário: a imagem (até 2 MB) e a miniatura (até 100 KB). Uma por
 * reporte, por enquanto.
 *
 * Não estende BaseOrmEntity: a foto não muda, é substituída por outra, com outro id. As
 * colunas das imagens usam `select: false`, para nenhuma consulta trazê-las sem pedir.
 */
@Entity('report_photos')
@Unique('uq_report_photos_report_id', ['reportId'])
export class ReportPhotoOrmEntity {
  /** Muda quando a foto é trocada: o app usa o id como chave do cache. */
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @ForeignKey(() => ReportOrmEntity, {
    name: 'fk_report_photos_report_id',
    onDelete: 'CASCADE',
    onUpdate: 'RESTRICT',
  })
  @Column({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 30 })
  mimeType: string;

  /** Da foto, lida do cabeçalho do JPEG. A miniatura tem a mesma proporção. */
  @Column({ type: 'smallint', unsigned: true })
  width: number;

  @Column({ type: 'smallint', unsigned: true })
  height: number;

  /** Da foto, depois da remoção dos metadados. */
  @Column({ name: 'size_bytes', type: 'int', unsigned: true })
  sizeBytes: number;

  @Column({ type: 'mediumblob', select: false })
  content: Buffer;

  @Column({ type: 'mediumblob', select: false })
  thumbnail: Buffer;

  @CreateDateColumn(CREATED_AT_COLUMN)
  createdAt: Date;
}
