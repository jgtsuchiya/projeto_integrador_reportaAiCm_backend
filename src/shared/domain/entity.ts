import { randomUUID } from 'node:crypto';

/**
 * Base das entidades de domínio: identidade própria, independente do banco.
 * Duas entidades são iguais quando têm o mesmo tipo e o mesmo id.
 */
export abstract class Entity {
  readonly id: string;

  protected constructor(id?: string) {
    this.id = id ?? randomUUID();
  }

  equals(other?: Entity): boolean {
    return (
      other instanceof Entity && other.constructor === this.constructor && other.id === this.id
    );
  }
}
