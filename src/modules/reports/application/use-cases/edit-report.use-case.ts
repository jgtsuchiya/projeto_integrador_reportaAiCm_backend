import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportPhoto } from '../../domain/entities/report-photo.entity';
import { ReportRepository } from '../../domain/repositories/report.repository';
import { ReportDescription } from '../../domain/value-objects/report-description';
import { ReportOutput, toReportOutput } from '../dtos/report.output';
import { ReportsConfig } from '../reports.config';
import { findVisibleReport } from '../services/find-visible-report';
import { ReportPhotoBytes } from './open-report.use-case';

/** Campos ausentes não mudam. A localização não muda nunca (RN28). */
export interface EditReportInput {
  reportId: string;
  /** Usuário da sessão. */
  userId: string;
  /** Vazia ou nula, apaga a descrição. */
  description?: string | null;
  /** A foto nova substitui a anterior, com outro id. */
  photo?: ReportPhotoBytes;
}

/**
 * Edição do reporte pelo autor (RN33): a descrição e a foto, enquanto ele está em validação e
 * sem votos. O reporte que o usuário não pode ver responde 404 (RN35), e o de outro autor que ele
 * vê, 403.
 */
@Injectable()
export class EditReportUseCase implements UseCase<EditReportInput, ReportOutput> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly config: ReportsConfig,
  ) {}

  async execute(input: EditReportInput): Promise<ReportOutput> {
    const report = await findVisibleReport(this.reportRepository, input.reportId, input.userId);

    // Os value objects são criados antes de qualquer alteração, para um valor inválido não deixar
    // a edição pela metade.
    const description =
      input.description === undefined
        ? undefined
        : ReportDescription.create(input.description ?? '');
    const photo = input.photo && ReportPhoto.create(input.photo, this.config.imageLimits);

    if (description !== undefined) {
      report.edit(input.userId, description);
    }
    if (photo) {
      report.replacePhoto(input.userId, photo);
    }
    await this.reportRepository.save(report, photo);

    // Só o autor chega aqui, e ele não vota no próprio reporte.
    return toReportOutput(report, input.userId, this.config, null);
  }
}
