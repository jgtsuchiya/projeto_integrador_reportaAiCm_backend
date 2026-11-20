import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import {
  ReportPhotoRepository,
  ReportPhotoSize,
} from '../../domain/repositories/report-photo.repository';
import { ReportRepository } from '../../domain/repositories/report.repository';
import { ReportPhotoOutput } from '../dtos/report-photo.output';
import { findVisibleReport } from '../services/find-visible-report';

export interface GetReportPhotoInput {
  reportId: string;
  /** Usuário da sessão. */
  userId: string;
  size: ReportPhotoSize;
}

/**
 * A foto inteira ou a miniatura do reporte, com a mesma visibilidade do detalhe (RN35). Só a
 * imagem pedida é lida do banco.
 */
@Injectable()
export class GetReportPhotoUseCase implements UseCase<GetReportPhotoInput, ReportPhotoOutput> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly reportPhotoRepository: ReportPhotoRepository,
  ) {}

  async execute(input: GetReportPhotoInput): Promise<ReportPhotoOutput> {
    await findVisibleReport(this.reportRepository, input.reportId, input.userId);
    const photo = await this.reportPhotoRepository.findContent(input.reportId, input.size);

    // Todo reporte tem foto. Sem ela, só se o reporte foi excluído entre as duas leituras.
    if (!photo) {
      throw new ReportNotFoundError();
    }

    return { id: photo.photoId, mimeType: photo.mimeType, content: photo.bytes };
  }
}
