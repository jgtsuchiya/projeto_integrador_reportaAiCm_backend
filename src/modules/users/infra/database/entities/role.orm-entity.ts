import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * Papéis de acesso (dados de referência, carregados pela migration).
 * Não estende BaseOrmEntity: os ids são fixos e a tabela não tem timestamps.
 */
@Entity('roles')
@Unique('uq_roles_code', ['code'])
export class RoleOrmEntity {
  @PrimaryColumn({ type: 'smallint', unsigned: true })
  id: number;

  /** Mesmo nome do papel no UserRoles do SuperTokens. */
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 60 })
  name: string;
}
