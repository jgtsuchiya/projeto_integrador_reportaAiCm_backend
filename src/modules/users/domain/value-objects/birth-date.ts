import { ValueObject } from '@shared/domain/value-object';

import { InvalidBirthDateError } from '../errors/invalid-birth-date.error';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE = '1900-01-01';

/**
 * Data de nascimento no formato `YYYY-MM-DD`, sem hora (como a coluna `DATE`).
 * Precisa ser uma data real e estar no passado.
 */
export class BirthDate extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(raw: string): BirthDate {
    const value = raw.trim();

    if (!ISO_DATE_PATTERN.test(value) || !BirthDate.isCalendarDate(value)) {
      throw new InvalidBirthDateError('Data de nascimento inválida. Use o formato AAAA-MM-DD.');
    }

    // Comparação de strings ISO: a ordem alfabética é a mesma da cronológica.
    if (value < MIN_DATE || value >= BirthDate.today()) {
      throw new InvalidBirthDateError('A data de nascimento precisa estar no passado.');
    }

    return new BirthDate(value);
  }

  /** Descarta datas que o `Date` "corrige" sozinho, como 2001-02-30 (vira 2001-03-02). */
  private static isCalendarDate(value: string): boolean {
    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
