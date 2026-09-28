import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { CREATED_AT_COLUMN, UPDATED_AT_COLUMN } from '@shared/infra/database/base.orm-entity';

import { UserOrmEntity } from './user.orm-entity';

/**
 * Dados exclusivos do Client (1:1 com users).
 * Não estende BaseOrmEntity: a PK é a própria FK para users.
 */
@Entity('client_profiles')
@Unique('uq_client_profiles_cpf', ['cpf'])
export class ClientProfileOrmEntity {
  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @OneToOne(() => UserOrmEntity, { onDelete: 'CASCADE', onUpdate: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_client_profiles_user_id' })
  user?: UserOrmEntity;

  /** Só dígitos. */
  @Column({ type: 'char', length: 11 })
  cpf: string;

  /** DDD + número, só dígitos. */
  @Column({ type: 'varchar', length: 11 })
  phone: string;

  /** Data pura (sem hora), no formato YYYY-MM-DD. */
  @Column({ name: 'birth_date', type: 'date' })
  birthDate: string;

  @CreateDateColumn(CREATED_AT_COLUMN)
  createdAt: Date;

  @UpdateDateColumn(UPDATED_AT_COLUMN)
  updatedAt: Date;
}
