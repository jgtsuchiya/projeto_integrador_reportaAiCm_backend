import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { EmailVerificationRequiredError } from '../../domain/errors/email-verification-required.error';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportRepository } from '../../domain/repositories/report.repository';
import { GeoLocation, GeoLocationInput } from '../../domain/value-objects/geo-location';
import { ReportVoteType } from '../../domain/value-objects/report-vote-type';
import { VotingRange } from '../../domain/value-objects/voting-range';
import { ReportOutput, toReportOutput } from '../dtos/report.output';
import { ReportsConfig } from '../reports.config';
import { findVisibleReport } from '../services/find-visible-report';

export interface VoteOnReportInput {
  reportId: string;
  /** Usuário da sessão. */
  voterId: string;
  /** Se ele já verificou o e-mail (RN37). Vem do usuário da sessão. */
  emailVerified: boolean;
  vote: ReportVoteType;
  /** Localização atual de quem vota. Só é conferida: não é gravada nem vai para o log (RN38). */
  location: GeoLocationInput;
}

/**
 * Voto de um Client num reporte de outro autor (RN37 a RN40), na ordem do fluxo do plano: o
 * e-mail verificado, o reporte visível (RN35), o reporte em validação e de outro autor, a
 * localização de quem vota e, por último, o voto repetido.
 *
 * As regras do reporte são conferidas duas vezes: antes, para responder sem abrir a transação,
 * e de novo pelo `Report.registerVote`, com a linha travada, porque outro voto pode ter mudado o
 * status nesse meio-tempo.
 */
@Injectable()
export class VoteOnReportUseCase implements UseCase<VoteOnReportInput, ReportOutput> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly config: ReportsConfig,
  ) {}

  async execute(input: VoteOnReportInput): Promise<ReportOutput> {
    if (!input.emailVerified) {
      throw new EmailVerificationRequiredError('vote');
    }

    const report = await findVisibleReport(this.reportRepository, input.reportId, input.voterId);
    report.ensureCanBeVotedBy(input.voterId);
    VotingRange.create({
      maxDistanceMeters: this.config.voteMaxDistanceMeters,
      maxAccuracyMeters: this.config.maxAccuracyMeters,
    }).ensureReaches(GeoLocation.create(input.location), report.location);

    const updated = await this.reportRepository.vote(report.id, (locked) =>
      locked.registerVote(input.voterId, input.vote, this.config),
    );

    // O autor excluiu o reporte entre a leitura e o voto (RN34).
    if (!updated) {
      throw new ReportNotFoundError();
    }

    return toReportOutput(updated, input.voterId, this.config, input.vote);
  }
}
