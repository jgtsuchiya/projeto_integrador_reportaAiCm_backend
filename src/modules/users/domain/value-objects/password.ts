import { randomBytes } from 'node:crypto';

import { InvalidPasswordError } from '../errors/invalid-password.error';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Senha em texto puro que ainda vai para o SuperTokens, que faz o hash (RN08).
 *
 * O valor fica num campo privado (`#value`), então não aparece em `JSON.stringify`,
 * `console.log` nem nos logs de erro. Só quem precisa lê explicitamente `password.value`.
 */
export class Password {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** Aplica a política da RN08: de 8 a 128 caracteres, com pelo menos uma letra e um número. */
  static create(raw: string): Password {
    if (raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
      throw new InvalidPasswordError(
        `A senha deve ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.`,
      );
    }

    if (!/\p{L}/u.test(raw) || !/\d/.test(raw)) {
      throw new InvalidPasswordError('A senha deve ter pelo menos uma letra e um número.');
    }

    return new Password(raw);
  }

  /**
   * Senha que ninguém conhece, para a credencial do ADMIN convidado, que define a própria
   * senha ao aceitar o convite (RN06). São 256 bits aleatórios em base64url, com uma letra e um
   * número no fim para garantir a política.
   */
  static random(): Password {
    return Password.create(`${randomBytes(32).toString('base64url')}a1`);
  }

  get value(): string {
    return this.#value;
  }
}
