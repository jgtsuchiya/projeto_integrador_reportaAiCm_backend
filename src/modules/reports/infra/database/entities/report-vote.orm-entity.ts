import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { CREATED_AT_COLUMN } from '@shared/infra/database/base.orm-entity';

import { ReportOrmEntity } from './report.orm-entity';

export const REPORT_VOTE_TYPES = ['CONFIRM', 'DENY'] as const;
export type ReportVoteTypeColumn = (typeof REPORT_VOTE_TYPES)[number];

/**
 * Voto de um Client num reporte de outro autor (RN37): "está lá" ou "não está lá". Um por
 * usuário e reporte, garantido pelo UNIQUE. As contagens ficam também em `reports`, atualizadas
 * na mesma transação que grava o voto (RN40).
 *
 * Não estende BaseOrmEntity: o voto não muda, então não tem `updated_at`. A localização de quem
 * vota não é gravada (RN38).
 */
@Entity('report_votes')
@Unique('uq_report_votes_report_id_user_id', ['reportId', 'userId'])
export class ReportVoteOrmEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  /** Os votos saem junto com o reporte, que só é apagado fisicamente nos testes. */
  @ForeignKey(() => ReportOrmEntity, {
    name: 'fk_report_votes_report_id',
    onDelete: 'CASCADE',
    onUpdate: 'RESTRICT',
  })
  @Column({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  /**
   * Quem votou. A FK é declarada pelo nome da tabela, como a do autor em `reports`: um módulo
   * não importa os arquivos internos de outro. Os usuários não são apagados (RN11).
   */
  @ForeignKey('users', {
    name: 'fk_report_votes_user_id',
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @Index('idx_report_votes_user_id')
  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @Column({ type: 'enum', enum: REPORT_VOTE_TYPES })
  vote: ReportVoteTypeColumn;

  @CreateDateColumn(CREATED_AT_COLUMN)
  createdAt: Date;
}
