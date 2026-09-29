import { ValueObject } from '@shared/domain/value-object';

import { InvalidCpfError } from '../errors/invalid-cpf.error';

const FORMATTED_PATTERN = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const DIGITS_PATTERN = /^\d{11}$/;

/**
 * CPF guardado só com dígitos (RN07). Aceita a entrada com ou sem máscara
 * (`123.456.789-09` ou `12345678909`) e valida os dígitos verificadores.
 */
export class Cpf extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(raw: string): Cpf {
    const trimmed = raw.trim();

    if (!FORMATTED_PATTERN.test(trimmed) && !DIGITS_PATTERN.test(trimmed)) {
      throw new InvalidCpfError();
    }

    const digits = trimmed.replace(/\D/g, '');

    if (!Cpf.hasValidCheckDigits(digits)) {
      throw new InvalidCpfError();
    }

    return new Cpf(digits);
  }

  /** CPF mascarado para ADMIN e SUPER_ADMIN (RN12): `***.456.789-**`. */
  masked(): string {
    return `***.${this.value.slice(3, 6)}.${this.value.slice(6, 9)}-**`;
  }

  private static hasValidCheckDigits(digits: string): boolean {
    // Sequências repetidas (000.000.000-00, 111...) passam no cálculo, mas não são CPFs válidos.
    if (/^(\d)\1{10}$/.test(digits)) {
      return false;
    }

    const numbers = [...digits].map(Number);

    return (
      Cpf.checkDigit(numbers.slice(0, 9)) === numbers[9] &&
      Cpf.checkDigit(numbers.slice(0, 10)) === numbers[10]
    );
  }

  private static checkDigit(numbers: number[]): number {
    const firstWeight = numbers.length + 1;
    const sum = numbers.reduce((total, digit, index) => total + digit * (firstWeight - index), 0);
    const rest = (sum * 10) % 11;

    return rest === 10 ? 0 : rest;
  }
}
