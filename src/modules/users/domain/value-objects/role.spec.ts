import { canManage, Role, ROLES } from './role';

describe('Role', () => {
  it('deve ter os códigos da tabela roles', () => {
    expect(ROLES).toEqual(['SUPER_ADMIN', 'ADMIN', 'CLIENT']);
  });

  describe('canManage', () => {
    it.each(ROLES)('ninguém gerencia um SUPER_ADMIN, nem %p (RN03)', (actor) => {
      expect(canManage(actor, Role.SUPER_ADMIN)).toBe(false);
    });

    it.each([
      [Role.SUPER_ADMIN, true],
      [Role.ADMIN, false],
      [Role.CLIENT, false],
    ])('%p gerencia ADMIN: %p (RN04)', (actor, expected) => {
      expect(canManage(actor, Role.ADMIN)).toBe(expected);
    });

    it.each([
      [Role.SUPER_ADMIN, true],
      [Role.ADMIN, true],
      [Role.CLIENT, false],
    ])('%p gerencia CLIENT: %p (RN12)', (actor, expected) => {
      expect(canManage(actor, Role.CLIENT)).toBe(expected);
    });
  });
});
