import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

import { CREATED_AT_COLUMN } from '@shared/infra/database/base.orm-entity';

/**
 * Tentativas de login, usadas no bloqueio por e-mail (RN17) e guardadas como registro (RN19).
 * Não tem FK para users de propósito: o e-mail informado pode não ter conta.
 * Não estende BaseOrmEntity: o registro não é alterado, então não tem updated_at.
 */
@Entity('login_attempts')
@Index('idx_login_attempts_email_created_at', ['email', 'createdAt'])
@Index('idx_login_attempts_created_at', ['createdAt'])
export class LoginAttemptOrmEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  /** E-mail informado no login, guardado com trim e em minúsculas. */
  @Column({ type: 'varchar', length: 254 })
  email: string;

  /** Cabe um IPv6. */
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  /** Cortado em 255 caracteres. */
  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'boolean' })
  succeeded: boolean;

  @CreateDateColumn(CREATED_AT_COLUMN)
  createdAt: Date;
}
