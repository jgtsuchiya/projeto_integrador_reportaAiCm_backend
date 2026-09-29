import { ValueObject } from '@shared/domain/value-object';

import { InvalidPhoneError } from '../errors/invalid-phone.error';

/**
 * DDD (11 a 99, sem zero) + número. Celular: 9 dígitos começando com 9.
 * Fixo: 8 dígitos começando de 2 a 5.
 */
const PHONE_PATTERN = /^[1-9]{2}(9\d{8}|[2-5]\d{7})$/;

/** Telefone guardado só com dígitos. Aceita a entrada com máscara, como `(43) 99999-8888`. */
export class Phone extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(raw: string): Phone {
    const trimmed = raw.trim();

    if (!/^[\d\s()+-]+$/.test(trimmed)) {
      throw new InvalidPhoneError();
    }

    const digits = trimmed.replace(/\D/g, '');

    if (!PHONE_PATTERN.test(digits)) {
      throw new InvalidPhoneError();
    }

    return new Phone(digits);
  }
}
