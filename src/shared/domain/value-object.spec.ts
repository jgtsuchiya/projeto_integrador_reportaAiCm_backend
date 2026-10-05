import { ValueObject } from './value-object';

class FakeValueObject extends ValueObject<string> {
  constructor(value: string) {
    super(value);
  }
}

class OtherFakeValueObject extends ValueObject<string> {
  constructor(value: string) {
    super(value);
  }
}

describe('ValueObject', () => {
  it('deve considerar iguais value objects do mesmo tipo com o mesmo valor', () => {
    expect(new FakeValueObject('a').equals(new FakeValueObject('a'))).toBe(true);
  });

  it('deve considerar diferentes value objects com valores diferentes', () => {
    expect(new FakeValueObject('a').equals(new FakeValueObject('b'))).toBe(false);
  });

  it('deve considerar diferentes value objects de tipos diferentes com o mesmo valor', () => {
    expect(new FakeValueObject('a').equals(new OtherFakeValueObject('a'))).toBe(false);
  });

  it('deve retornar false ao comparar com undefined', () => {
    expect(new FakeValueObject('a').equals(undefined)).toBe(false);
  });
});
