import { Column, DeleteDateColumn, Entity, ForeignKey, Index, Unique } from 'typeorm';

import { BaseOrmEntity } from '@shared/infra/database/base.orm-entity';

export const REPORT_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED'] as const;
export type ReportStatusColumn = (typeof REPORT_STATUSES)[number];

/** SRID do WGS 84, o sistema de coordenadas do GPS. */
export const WGS84_SRID = 4326;

/**
 * Reporte de buraco aberto por um Client. A foto fica em `report_photos`, para as listagens
 * não lerem as imagens.
 *
 * O UNIQUE da `Idempotency-Key` (uma por autor) começa pela chave: com o autor na frente, o
 * MySQL 9.7 deixa de conferir a FK do autor nas linhas com a chave nula (ver a migration
 * CreateReportsTables).
 */
@Entity('reports')
@Index('idx_reports_author_id_created_at', ['authorId', 'createdAt'])
@Unique('uq_reports_idempotency_key_author_id', ['idempotencyKey', 'authorId'])
export class ReportOrmEntity extends BaseOrmEntity {
  /**
   * A FK é declarada pelo nome da tabela, sem relação com a entidade do módulo users: um
   * módulo não importa os arquivos internos de outro. Os usuários não são apagados (RN11).
   */
  @ForeignKey('users', { name: 'fk_reports_author_id', onDelete: 'RESTRICT', onUpdate: 'RESTRICT' })
  @Column({ name: 'author_id', type: 'char', length: 36 })
  authorId: string;

  @Column({ type: 'enum', enum: REPORT_STATUSES, default: 'PENDING' })
  status: ReportStatusColumn;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /**
   * `POINT NOT NULL SRID 4326`. O repositório grava e lê a coluna pelas funções espaciais,
   * com a ordem dos eixos explícita, e por isso o TypeORM não a seleciona sozinho
   * (`select: false`). O SRID está só na migration: o TypeORM não o gera no MySQL.
   */
  @Index('sidx_reports_location', { spatial: true })
  @Column({ type: 'point', srid: WGS84_SRID, select: false })
  location: string;

  /** Precisão informada pelo aparelho, em metros, arredondada para cima. */
  @Column({ name: 'accuracy_meters', type: 'smallint', unsigned: true })
  accuracyMeters: number;

  @Column({ name: 'confirmations_count', type: 'smallint', unsigned: true, default: 0 })
  confirmationsCount: number;

  @Column({ name: 'rejections_count', type: 'smallint', unsigned: true, default: 0 })
  rejectionsCount: number;

  /** Chave do envio repetido seguro (RN31). Vale por autor. */
  @Column({ name: 'idempotency_key', type: 'char', length: 36, nullable: true })
  idempotencyKey: string | null;

  /** Quando o reporte saiu de PENDING. */
  @Column({ name: 'status_changed_at', type: 'datetime', precision: 3, nullable: true })
  statusChangedAt: Date | null;

  /** Exclusão lógica pelo autor (RN34). */
  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', precision: 3, nullable: true })
  deletedAt: Date | null;
}
