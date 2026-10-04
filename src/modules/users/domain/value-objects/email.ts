import { ValueObject } from '@shared/domain/value-object';

import { InvalidEmailError } from '../errors/invalid-email.error';

const MAX_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** E-mail normalizado (`trim` + minúsculas), identificador de login de todos os papéis (RN02). */
export class Email extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    const localPart = value.split('@')[0];

    if (
      value.length > MAX_LENGTH ||
      localPart.length > MAX_LOCAL_PART_LENGTH ||
      !EMAIL_PATTERN.test(value)
    ) {
      throw new InvalidEmailError();
    }

    return new Email(value);
  }
}
