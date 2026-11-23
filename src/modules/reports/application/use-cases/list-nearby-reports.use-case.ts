import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportRepository } from '../../domain/repositories/report.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';
import { VotingRange } from '../../domain/value-objects/voting-range';
import { NearbyReportOutput, toReportOutput } from '../dtos/report.output';
import { ReportsConfig } from '../reports.config';

/** Raio da busca, em metros: o padrão e a faixa aceita. */
export const NEARBY_RADIUS_DEFAULT_METERS = 1000;
export const NEARBY_RADIUS_MIN_METERS = 10;
export const NEARBY_RADIUS_MAX_METERS = 5000;

/** Máximo de reportes devolvidos, os mais perto. */
export const NEARBY_REPORTS_LIMIT = 50;

export interface ListNearbyReportsInput {
  /** Usuário da sessão. */
  userId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface NearbyReportsOutput {
  items: NearbyReportOutput[];
}

/**
 * Reportes PENDING e CONFIRMED de qualquer autor perto de um ponto, do mais perto ao mais longe
 * (RN35). O app usa a busca para avisar de um reporte repetido antes da abertura (raio de 30 m)
 * e, na validação comunitária, para a lista dos reportes perto do cidadão.
 *
 * Aqui, o `canVote` também exige o reporte a até `REPORT_VOTE_MAX_DISTANCE_METERS` do ponto
 * consultado, que na lista da validação é a posição do cidadão (RN38).
 */
@Injectable()
export class ListNearbyReportsUseCase implements UseCase<
  ListNearbyReportsInput,
  NearbyReportsOutput
> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly config: ReportsConfig,
  ) {}

  async execute(input: ListNearbyReportsInput): Promise<NearbyReportsOutput> {
    const center = GeoPoint.create(input);
    const nearby = await this.reportRepository.findNearby(
      center,
      input.radiusMeters,
      NEARBY_REPORTS_LIMIT,
    );
    const votes = await this.reportRepository.findVotes(
      input.userId,
      nearby.filter(({ report }) => !report.isAuthor(input.userId)).map(({ report }) => report.id),
    );
    const range = VotingRange.create({
      maxDistanceMeters: this.config.voteMaxDistanceMeters,
      maxAccuracyMeters: this.config.maxAccuracyMeters,
    });

    return {
      items: nearby.map(({ report, distanceMeters }) => {
        const output = toReportOutput(
          report,
          input.userId,
          this.config,
          votes.get(report.id) ?? null,
        );

        return {
          ...output,
          canVote: output.canVote && range.covers(distanceMeters),
          distanceMeters: Math.round(distanceMeters),
        };
      }),
    };
  }
}
