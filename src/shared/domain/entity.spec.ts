import { Entity } from './entity';

class FakeEntity extends Entity {
  constructor(id?: string) {
    super(id);
  }
}

class OtherFakeEntity extends Entity {
  constructor(id?: string) {
    super(id);
  }
}

describe('Entity', () => {
  it('deve gerar um UUID quando nenhum id é informado', () => {
    const sut = new FakeEntity();

    expect(sut.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('deve manter o id informado (reconstrução a partir do banco)', () => {
    const sut = new FakeEntity('existing-id');

    expect(sut.id).toBe('existing-id');
  });

  it('deve considerar iguais entidades do mesmo tipo com o mesmo id', () => {
    expect(new FakeEntity('a').equals(new FakeEntity('a'))).toBe(true);
  });

  it('deve considerar diferentes entidades com ids diferentes', () => {
    expect(new FakeEntity('a').equals(new FakeEntity('b'))).toBe(false);
  });

  it('deve considerar diferentes entidades de tipos diferentes com o mesmo id', () => {
    expect(new FakeEntity('a').equals(new OtherFakeEntity('a'))).toBe(false);
  });

  it('deve retornar false ao comparar com undefined', () => {
    expect(new FakeEntity('a').equals(undefined)).toBe(false);
  });
});
