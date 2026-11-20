import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportRepository } from '../../domain/repositories/report.repository';
import { GeoPoint } from '../../domain/value-objects/geo-point';
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

    return {
      items: nearby.map(({ report, distanceMeters }) => ({
        ...toReportOutput(report, input.userId, this.config),
        distanceMeters: Math.round(distanceMeters),
      })),
    };
  }
}
