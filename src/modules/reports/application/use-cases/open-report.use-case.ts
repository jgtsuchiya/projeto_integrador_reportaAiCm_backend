import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ReportPhoto } from '../../domain/entities/report-photo.entity';
import { Report } from '../../domain/entities/report.entity';
import { DuplicateIdempotencyKeyError } from '../../domain/errors/duplicate-idempotency-key.error';
import { EmailVerificationRequiredError } from '../../domain/errors/email-verification-required.error';
import { ReportDailyLimitError } from '../../domain/errors/report-daily-limit.error';
import { ReportNotFoundError } from '../../domain/errors/report-not-found.error';
import { ReportRepository } from '../../domain/repositories/report.repository';
import { GeoLocation, GeoLocationInput } from '../../domain/value-objects/geo-location';
import { ReportArea } from '../../domain/value-objects/report-area';
import { ReportDescription } from '../../domain/value-objects/report-description';
import { ReportOutput, toReportOutput } from '../dtos/report.output';
import { ReportsConfig } from '../reports.config';

/** Janela do limite de reportes por Client (RN30). */
export const REPORT_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** As duas imagens da foto, já decodificadas do base64 pela apresentação. */
export interface ReportPhotoBytes {
  content: Uint8Array;
  thumbnail: Uint8Array;
}

export interface OpenReportInput {
  /** Usuário da sessão, que fica como autor. */
  authorId: string;
  /** Se o autor já verificou o e-mail (RN26). Vem do usuário da sessão. */
  emailVerified: boolean;
  /** Vazia ou nula, o reporte fica sem descrição. */
  description?: string | null;
  location: GeoLocationInput;
  photo: ReportPhotoBytes;
  /** Header `Idempotency-Key`, um UUID (RN31). */
  idempotencyKey?: string;
}

/**
 * Abertura do reporte pelo Client (RN26 a RN32). Recebe os bytes da foto, e não o base64: o
 * formato do transporte fica na apresentação, e o caso de uso não muda se o envio passar a ser
 * multipart.
 *
 * Com uma `Idempotency-Key` que o autor já usou, devolve o reporte já criado, sem criar outro e
 * sem contar no limite por dia. Dois pedidos simultâneos com a mesma chave passam juntos pela
 * busca, mas só um grava: o outro esbarra no UNIQUE do banco e devolve o reporte do primeiro.
 */
@Injectable()
export class OpenReportUseCase implements UseCase<OpenReportInput, ReportOutput> {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly config: ReportsConfig,
  ) {}

  async execute(input: OpenReportInput): Promise<ReportOutput> {
    if (!input.emailVerified) {
      throw new EmailVerificationRequiredError();
    }

    const idempotencyKey = input.idempotencyKey ?? null;
    if (idempotencyKey) {
      const existing = await this.reportRepository.findByIdempotencyKey(
        input.authorId,
        idempotencyKey,
      );
      if (existing) {
        return this.toRepeatedOutput(existing, input.authorId);
      }
    }

    const photo = ReportPhoto.create(input.photo, this.config.imageLimits);
    const report = Report.open({
      authorId: input.authorId,
      description: ReportDescription.create(input.description ?? ''),
      location: GeoLocation.create(input.location),
      photo,
      idempotencyKey,
      area: ReportArea.create({
        bounds: this.config.areaBounds,
        maxAccuracyMeters: this.config.maxAccuracyMeters,
      }),
    });
    await this.ensureDailyLimit(input.authorId);

    try {
      await this.reportRepository.create(report, photo);
    } catch (error) {
      if (!idempotencyKey || !(error instanceof DuplicateIdempotencyKeyError)) {
        throw error;
      }

      const existing = await this.reportRepository.findByIdempotencyKey(
        input.authorId,
        idempotencyKey,
      );
      if (!existing) {
        throw error;
      }

      return this.toRepeatedOutput(existing, input.authorId);
    }

    return toReportOutput(report, input.authorId, this.config);
  }

  /** RN30: os reportes excluídos também contam, para a exclusão não liberar mais aberturas. */
  private async ensureDailyLimit(authorId: string): Promise<void> {
    const since = new Date(Date.now() - REPORT_DAILY_WINDOW_MS);
    const opened = await this.reportRepository.countCreatedSince(authorId, since);

    if (opened >= this.config.dailyLimit) {
      throw new ReportDailyLimitError(this.config.dailyLimit);
    }
  }

  /**
   * Resposta do pedido repetido (RN31): o reporte que a chave já criou. Se o autor o excluiu
   * depois, a chave não abre outro, e o reporte continua sumido de todas as rotas (RN34).
   */
  private toRepeatedOutput(report: Report, authorId: string): ReportOutput {
    if (report.isDeleted) {
      throw new ReportNotFoundError();
    }

    return toReportOutput(report, authorId, this.config);
  }
}
