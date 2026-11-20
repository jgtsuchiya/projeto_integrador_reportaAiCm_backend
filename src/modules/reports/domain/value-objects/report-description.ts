import { ValueObject } from '@shared/domain/value-object';

import { InvalidReportDescriptionError } from '../errors/invalid-report-description.error';

export const REPORT_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Descrição opcional do reporte (RN27), com `trim`. O texto vazio não é uma descrição: a fábrica
 * devolve `null`, e o reporte fica sem descrição.
 *
 * Os caracteres são contados como o MySQL conta no `VARCHAR`: um emoji vale um.
 */
export class ReportDescription extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(raw: string): ReportDescription | null {
    const value = raw.trim();

    if (value.length === 0) {
      return null;
    }

    // Cada caractere ocupa no máximo duas unidades UTF-16: um texto maior que o dobro do limite
    // é recusado sem ser percorrido, e o corpo das rotas de reportes aceita até 3 MB.
    if (
      value.length > REPORT_DESCRIPTION_MAX_LENGTH * 2 ||
      Array.from(value).length > REPORT_DESCRIPTION_MAX_LENGTH
    ) {
      throw new InvalidReportDescriptionError(REPORT_DESCRIPTION_MAX_LENGTH);
    }

    return new ReportDescription(value);
  }
}
