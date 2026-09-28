import { ColumnOptions, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Opções das colunas de timestamp, para reaproveitar nas tabelas que não estendem BaseOrmEntity.
 * O default é explícito porque o TypeORM gera CURRENT_TIMESTAMP(6), que o MySQL recusa
 * numa coluna datetime(3) (a precisão do default precisa ser igual à da coluna).
 */
export const CREATED_AT_COLUMN: ColumnOptions = {
  name: 'created_at',
  type: 'datetime',
  precision: 3,
  default: () => 'CURRENT_TIMESTAMP(3)',
};

export const UPDATED_AT_COLUMN: ColumnOptions = {
  name: 'updated_at',
  type: 'datetime',
  precision: 3,
  default: () => 'CURRENT_TIMESTAMP(3)',
  onUpdate: 'CURRENT_TIMESTAMP(3)',
};

/**
 * Colunas comuns a todas as tabelas.
 * O id é gerado pelo domínio (UUID v4), não pelo banco.
 */
export abstract class BaseOrmEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @CreateDateColumn(CREATED_AT_COLUMN)
  createdAt: Date;

  @UpdateDateColumn(UPDATED_AT_COLUMN)
  updatedAt: Date;
}
