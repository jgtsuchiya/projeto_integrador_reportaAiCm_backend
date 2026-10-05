/**
 * Base dos value objects de valor primitivo: sem identidade própria, imutáveis e
 * validados na criação. Dois value objects são iguais quando têm o mesmo tipo e o mesmo valor.
 */
export abstract class ValueObject<T extends string | number | boolean> {
  protected constructor(readonly value: T) {}

  equals(other?: ValueObject<T>): boolean {
    return (
      other instanceof ValueObject &&
      other.constructor === this.constructor &&
      other.value === this.value
    );
  }
}
