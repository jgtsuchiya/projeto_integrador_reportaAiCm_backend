import { Entity } from '@shared/domain/entity';

import { OwnReportVoteError } from '../errors/own-report-vote.error';
import { ReportAuthorOnlyError } from '../errors/report-author-only.error';
import { ReportHasVotesError } from '../errors/report-has-votes.error';
import { ReportNotDeletableError } from '../errors/report-not-deletable.error';
import { ReportNotEditableError } from '../errors/report-not-editable.error';
import { ReportNotFoundError } from '../errors/report-not-found.error';
import { ReportNotInValidationError } from '../errors/report-not-in-validation.error';
import { GeoLocation } from '../value-objects/geo-location';
import { ReportArea } from '../value-objects/report-area';
import { ReportDescription } from '../value-objects/report-description';
import { PUBLIC_REPORT_STATUSES, ReportStatus } from '../value-objects/report-status';
import { ReportVoteType, VoteThresholds } from '../value-objects/report-vote-type';
import { ReportPhoto, ReportPhotoInfo } from './report-photo.entity';
import { ReportVote } from './report-vote.entity';

export interface ReportProps {
  authorId: string;
  status: ReportStatus;
  description: ReportDescription | null;
  location: GeoLocation;
  photo: ReportPhotoInfo;
  /** Cópia das contagens de `report_votes`, atualizada com cada voto (RN40). */
  confirmationsCount: number;
  rejectionsCount: number;
  /** `Idempotency-Key` do pedido que abriu o reporte (RN31). */
  idempotencyKey: string | null;
  /** Quando o reporte saiu de PENDING. */
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface OpenReportInput {
  authorId: string;
  description: ReportDescription | null;
  location: GeoLocation;
  photo: ReportPhoto;
  idempotencyKey: string | null;
  /** Área atendida, que confere a localização (RN28). */
  area: ReportArea;
}

/**
 * Reporte de buraco no asfalto, aberto por um Client.
 *
 * Nasce PENDING (em validação), com as contagens zeradas. Só o autor o altera: a descrição e a
 * foto enquanto ele está em validação e sem votos (RN33), e a exclusão enquanto ele está em
 * validação (RN34). A localização não muda depois da abertura (RN28). Os outros cidadãos só
 * veem o reporte em PENDING ou CONFIRMED (RN35).
 *
 * Na validação comunitária, os outros cidadãos votam enquanto ele está em validação (RN37). Ao
 * chegar ao número de votos de um tipo, ele vira CONFIRMED ou REJECTED, de forma definitiva
 * (RN39).
 */
export class Report extends Entity {
  private constructor(
    id: string | undefined,
    private readonly props: ReportProps,
  ) {
    super(id);
  }

  /** Abre um reporte novo (RN27, RN28 e RN32). */
  static open(input: OpenReportInput): Report {
    input.area.ensureAccepts(input.location);
    const now = new Date();

    return new Report(undefined, {
      authorId: input.authorId,
      status: ReportStatus.PENDING,
      description: input.description,
      location: input.location,
      photo: input.photo.info,
      confirmationsCount: 0,
      rejectionsCount: 0,
      idempotencyKey: input.idempotencyKey,
      statusChangedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  /** Reconstrói um reporte já persistido, sem validar nem alterar os dados. */
  static restore(id: string, props: ReportProps): Report {
    return new Report(id, { ...props, photo: { ...props.photo } });
  }

  get authorId(): string {
    return this.props.authorId;
  }

  get status(): ReportStatus {
    return this.props.status;
  }

  get description(): ReportDescription | null {
    return this.props.description;
  }

  get location(): GeoLocation {
    return this.props.location;
  }

  get photo(): ReportPhotoInfo {
    return { ...this.props.photo };
  }

  get confirmationsCount(): number {
    return this.props.confirmationsCount;
  }

  get rejectionsCount(): number {
    return this.props.rejectionsCount;
  }

  get idempotencyKey(): string | null {
    return this.props.idempotencyKey;
  }

  get statusChangedAt(): Date | null {
    return this.props.statusChangedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  get hasVotes(): boolean {
    return this.props.confirmationsCount + this.props.rejectionsCount > 0;
  }

  isAuthor(userId: string): boolean {
    return this.props.authorId === userId;
  }

  /**
   * RN35: o autor vê o reporte em qualquer status, e os outros cidadãos, só em PENDING ou
   * CONFIRMED. Ninguém vê o reporte excluído.
   */
  isVisibleTo(userId: string): boolean {
    return (
      !this.isDeleted &&
      (this.isAuthor(userId) || PUBLIC_REPORT_STATUSES.includes(this.props.status))
    );
  }

  /** RN33: o autor, com o reporte em validação e sem votos. */
  canBeEditedBy(userId: string): boolean {
    return this.isAuthor(userId) && !this.isDeleted && this.isPending && !this.hasVotes;
  }

  /** RN34: o autor, com o reporte em validação. */
  canBeDeletedBy(userId: string): boolean {
    return this.isAuthor(userId) && !this.isDeleted && this.isPending;
  }

  /**
   * RN37: outro cidadão, com o reporte em validação. Se ele já votou, quem sabe é o
   * repositório: o voto não fica no reporte, só as contagens.
   */
  canBeVotedBy(userId: string): boolean {
    return !this.isAuthor(userId) && !this.isDeleted && this.isPending;
  }

  /** Lança o erro da regra que impede o voto (RN37). */
  ensureCanBeVotedBy(voterId: string): void {
    if (this.isDeleted) {
      throw new ReportNotFoundError();
    }

    if (this.isAuthor(voterId)) {
      throw new OwnReportVoteError();
    }

    if (!this.isPending) {
      throw new ReportNotInValidationError();
    }
  }

  /**
   * Soma o voto e, quando a contagem desse tipo chega ao limite, muda o status de forma
   * definitiva (RN39): CONFIRMED com as confirmações, REJECTED com os votos "não está lá". Só o
   * tipo votado é conferido, então vale o que chegar primeiro.
   *
   * Devolve o voto para o repositório gravar junto com as contagens, na mesma transação e com a
   * linha do reporte travada (RN40). O voto repetido é barrado pelo repositório.
   */
  registerVote(voterId: string, type: ReportVoteType, thresholds: VoteThresholds): ReportVote {
    this.ensureCanBeVotedBy(voterId);
    this.touch();

    if (type === ReportVoteType.CONFIRM) {
      this.props.confirmationsCount += 1;
      if (this.props.confirmationsCount >= thresholds.confirmationsRequired) {
        this.changeStatus(ReportStatus.CONFIRMED);
      }
    } else {
      this.props.rejectionsCount += 1;
      if (this.props.rejectionsCount >= thresholds.rejectionsRequired) {
        this.changeStatus(ReportStatus.REJECTED);
      }
    }

    return ReportVote.create({ reportId: this.id, voterId, type }, this.props.updatedAt);
  }

  /** Troca a descrição (RN33). Com `null`, o reporte fica sem descrição. */
  edit(actorId: string, description: ReportDescription | null): void {
    this.ensureEditableBy(actorId);
    this.props.description = description;
    this.touch();
  }

  /** Troca a foto por outra, com outro id (RN33). */
  replacePhoto(actorId: string, photo: ReportPhoto): void {
    this.ensureEditableBy(actorId);
    this.props.photo = photo.info;
    this.touch();
  }

  /** Exclusão lógica (RN34). Os votos do reporte continuam no banco. */
  delete(actorId: string): void {
    this.ensureAuthor(actorId);

    if (!this.isPending) {
      throw new ReportNotDeletableError();
    }

    this.touch();
    this.props.deletedAt = this.props.updatedAt;
  }

  private get isPending(): boolean {
    return this.props.status === ReportStatus.PENDING;
  }

  private ensureEditableBy(actorId: string): void {
    this.ensureAuthor(actorId);

    if (!this.isPending) {
      throw new ReportNotEditableError();
    }

    if (this.hasVotes) {
      throw new ReportHasVotesError();
    }
  }

  private ensureAuthor(actorId: string): void {
    if (this.isDeleted) {
      throw new ReportNotFoundError();
    }

    if (!this.isAuthor(actorId)) {
      throw new ReportAuthorOnlyError();
    }
  }

  private changeStatus(status: ReportStatus): void {
    this.props.status = status;
    this.props.statusChangedAt = this.props.updatedAt;
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
