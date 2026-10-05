import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { CREATED_AT_COLUMN } from '@shared/infra/database/base.orm-entity';

import { UserOrmEntity } from './user.orm-entity';

export const USER_TOKEN_TYPES = [
  'INVITATION',
  'PASSWORD_RESET',
  'EMAIL_VERIFICATION',
  'LOGIN_CODE',
] as const;
export type UserTokenTypeColumn = (typeof USER_TOKEN_TYPES)[number];

/**
 * Tokens de uso único enviados por e-mail: os links de convite, de redefinição de senha e de
 * verificação de e-mail, e o código da segunda etapa do login.
 * Guarda só o hash SHA-256: o token puro vai apenas no e-mail.
 * Não estende BaseOrmEntity: a tabela não tem updated_at.
 */
@Entity('user_tokens')
@Unique('uq_user_tokens_token_hash', ['tokenHash'])
@Index('idx_user_tokens_user_id_type', ['userId', 'type'])
export class UserTokenOrmEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE', onUpdate: 'RESTRICT' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_tokens_user_id' })
  user?: UserOrmEntity;

  @Column({ type: 'enum', enum: USER_TOKEN_TYPES })
  type: UserTokenTypeColumn;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  /** Erros na conferência do código. Só o LOGIN_CODE usa. */
  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  attempts: number;

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'datetime', precision: 3, nullable: true })
  usedAt: Date | null;

  @CreateDateColumn(CREATED_AT_COLUMN)
  createdAt: Date;
}
