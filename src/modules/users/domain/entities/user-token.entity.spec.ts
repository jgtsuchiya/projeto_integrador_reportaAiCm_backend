import { createHash } from 'node:crypto';

import { InvalidUserTokenError } from '../errors/invalid-user-token.error';
import { UserTokenType } from '../value-objects/user-token-type';
import { UserToken, UserTokenProps } from './user-token.entity';

describe('UserToken', () => {
  const HOUR_IN_MS = 60 * 60 * 1000;

  function restore(overrides: Partial<UserTokenProps> = {}): UserToken {
    return UserToken.restore('token-1', {
      userId: 'user-1',
      type: UserTokenType.INVITATION,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-09-30T12:00:00.000Z'),
      usedAt: null,
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
      ...overrides,
    });
  }

  describe('issue', () => {
    it('deve emitir o token com a validade informada e sem uso', () => {
      const before = Date.now();

      const { token } = UserToken.issue({
        userId: 'user-1',
        type: UserTokenType.INVITATION,
        validForHours: 48,
      });

      expect(token.id).toEqual(expect.any(String));
      expect(token.userId).toBe('user-1');
      expect(token.type).toBe(UserTokenType.INVITATION);
      expect(token.usedAt).toBeNull();
      expect(token.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(48 * HOUR_IN_MS);
      expect(token.isUsable()).toBe(true);
    });

    it('deve guardar só o hash SHA-256 do segredo, que vai no link', () => {
      const { token, secret } = UserToken.issue({
        userId: 'user-1',
        type: UserTokenType.INVITATION,
        validForHours: 48,
      });

      expect(secret).toMatch(/^[\w-]{43}$/);
      expect(token.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
      expect(token.tokenHash).not.toContain(secret);
      expect(JSON.stringify(token)).not.toContain(secret);
    });

    it('deve gerar um segredo diferente a cada emissão', () => {
      const input = { userId: 'user-1', type: UserTokenType.INVITATION, validForHours: 48 };

      const first = UserToken.issue(input);
      const second = UserToken.issue(input);

      expect(second.secret).not.toBe(first.secret);
      expect(second.token.tokenHash).not.toBe(first.token.tokenHash);
      expect(second.token.id).not.toBe(first.token.id);
    });
  });

  describe('hash', () => {
    it('deve gerar sempre o mesmo hash de 64 caracteres hexadecimais para o mesmo segredo', () => {
      expect(UserToken.hash('segredo')).toBe(UserToken.hash('segredo'));
      expect(UserToken.hash('segredo')).toMatch(/^[0-9a-f]{64}$/);
      expect(UserToken.hash('outro')).not.toBe(UserToken.hash('segredo'));
    });
  });

  describe('restore', () => {
    it('deve reconstruir o token sem alterar os dados', () => {
      const usedAt = new Date('2026-09-29T08:00:00.000Z');

      const sut = restore({ usedAt });

      expect(sut.id).toBe('token-1');
      expect(sut.userId).toBe('user-1');
      expect(sut.tokenHash).toBe('a'.repeat(64));
      expect(sut.expiresAt).toEqual(new Date('2026-09-30T12:00:00.000Z'));
      expect(sut.usedAt).toBe(usedAt);
      expect(sut.createdAt).toEqual(new Date('2026-09-28T12:00:00.000Z'));
    });
  });

  describe('isUsable', () => {
    it('deve aceitar um token sem uso antes de expirar', () => {
      expect(restore().isUsable(new Date('2026-09-30T11:59:59.999Z'))).toBe(true);
    });

    it('deve recusar um token expirado, inclusive no instante exato da expiração', () => {
      const sut = restore();

      expect(sut.isUsable(new Date('2026-09-30T12:00:00.000Z'))).toBe(false);
      expect(sut.isUsable(new Date('2026-10-01T00:00:00.000Z'))).toBe(false);
    });

    it('deve recusar um token já usado', () => {
      const sut = restore({ usedAt: new Date('2026-09-29T08:00:00.000Z') });

      expect(sut.isUsable(new Date('2026-09-29T09:00:00.000Z'))).toBe(false);
    });
  });

  describe('use', () => {
    it('deve registrar o uso', () => {
      const sut = restore();
      const now = new Date('2026-09-29T08:00:00.000Z');

      sut.use(now);

      expect(sut.usedAt).toBe(now);
      expect(sut.isUsable(now)).toBe(false);
    });

    it('deve impedir o segundo uso (uso único)', () => {
      const sut = restore();
      sut.use(new Date('2026-09-29T08:00:00.000Z'));

      expect(() => sut.use(new Date('2026-09-29T09:00:00.000Z'))).toThrow(InvalidUserTokenError);
    });

    it('deve impedir o uso de um token expirado', () => {
      const sut = restore();

      expect(() => sut.use(new Date('2026-10-01T00:00:00.000Z'))).toThrow(InvalidUserTokenError);
      expect(sut.usedAt).toBeNull();
    });
  });
});
