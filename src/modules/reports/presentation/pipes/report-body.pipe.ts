import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { ZodValidationPipe } from '@shared/presentation/pipes/zod-validation.pipe';

import { ReportsConfig } from '../../application/reports.config';
import {
  type EditReportBody,
  editReportBodySchema,
  type OpenReportBody,
  openReportBodySchema,
} from '../dtos/report.dto';

/**
 * Valida o corpo com um schema que depende dos limites das imagens, que vêm da configuração.
 * O `@Body({ schema })` recebe só um schema fixo, então o schema é montado no construtor, com a
 * injeção de dependência, e validado pelo `ZodValidationPipe`: o 400 sai no mesmo formato das
 * outras rotas, com todos os campos de uma vez.
 */
abstract class ConfiguredBodyPipe<T> implements PipeTransform<unknown, Promise<T>> {
  private readonly validation = new ZodValidationPipe();

  protected constructor(private readonly schema: z.ZodType<T>) {}

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<T> {
    return (await this.validation.transform(value, { ...metadata, schema: this.schema })) as T;
  }
}

/** Corpo do `POST /api/reports`: `@Body(OpenReportBodyPipe)`. */
@Injectable()
export class OpenReportBodyPipe extends ConfiguredBodyPipe<OpenReportBody> {
  constructor(config: ReportsConfig) {
    super(openReportBodySchema(config.imageLimits));
  }
}

/** Corpo do `PATCH /api/reports/:id`: `@Body(EditReportBodyPipe)`. */
@Injectable()
export class EditReportBodyPipe extends ConfiguredBodyPipe<EditReportBody> {
  constructor(config: ReportsConfig) {
    super(editReportBodySchema(config.imageLimits));
  }
}
