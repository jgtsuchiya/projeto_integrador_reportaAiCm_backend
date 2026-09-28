import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseOrmEntity } from '@shared/infra/database/base.orm-entity';

import { RoleOrmEntity } from './role.orm-entity';

export const USER_STATUSES = ['PENDING', 'ACTIVE', 'INACTIVE'] as const;
export type UserStatusColumn = (typeof USER_STATUSES)[number];

/**
 * Dados comuns a todos os papéis. Não tem senha: as credenciais ficam no SuperTokens,
 * e o id é o mesmo gerado por ele no cadastro.
 */
@Entity('users')
@Unique('uq_users_email', ['email'])
export class UserOrmEntity extends BaseOrmEntity {
  @Index('idx_users_role_id')
  @Column({ name: 'role_id', type: 'smallint', unsigned: true })
  roleId: number;

  @ManyToOne(() => RoleOrmEntity, { onDelete: 'RESTRICT', onUpdate: 'RESTRICT' })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'fk_users_role_id' })
  role?: RoleOrmEntity;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Cópia do e-mail do SuperTokens, guardada com trim e em minúsculas. */
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'enum', enum: USER_STATUSES })
  status: UserStatusColumn;

  @Column({ name: 'email_verified_at', type: 'datetime', precision: 3, nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'last_login_at', type: 'datetime', precision: 3, nullable: true })
  lastLoginAt: Date | null;

  /** SuperAdm que convidou o ADM. NULL para o seed e para o Client. */
  @Index('idx_users_created_by_id')
  @Column({ name: 'created_by_id', type: 'char', length: 36, nullable: true })
  createdById: string | null;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'RESTRICT', onUpdate: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id', foreignKeyConstraintName: 'fk_users_created_by_id' })
  createdBy?: UserOrmEntity | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', precision: 3, nullable: true })
  deletedAt: Date | null;
}
