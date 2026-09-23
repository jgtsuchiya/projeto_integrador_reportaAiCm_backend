import { CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Colunas comuns a todas as tabelas.
 * O id é gerado pelo domínio (UUID v4), não pelo banco.
 */
export abstract class BaseOrmEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
