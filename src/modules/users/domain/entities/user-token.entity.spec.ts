import crypto, { createHash } from 'node:crypto';

import { InvalidUserTokenError } from '../errors/invalid-user-token.error';
import { UserTokenType } from '../value-objects/user-token-type';
import { LOGIN_CODE_MAX_ATTEMPTS, UserToken, UserTokenProps } from './user-token.entity';

describe('UserToken', () => {
  const MINUTE_IN_MS = 60 * 1000;

  function restore(overrides: Partial<UserTokenProps> = {}): UserToken {
    return UserToken.restore('token-1', {
      userId: 'user-1',
      type: UserTokenType.INVITATION,
      tokenHash: 'a'.repeat(64),
      attempts: 0,
      expiresAt: new Date('2026-09-30T12:00:00.000Z'),
      usedAt: null,
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
      ...overrides,
    });
  }

  describe('issue', () => {
    it('deve emitir o token com a validade informada, em minutos, e sem uso', () => {
      const before = Date.now();

      const { token } = UserToken.issue({
        userId: 'user-1',
        type: UserTokenType.INVITATION,
        validForMinutes: 48 * 60,
      });

      expect(token.id).toEqual(expect.any(String));
      expect(token.userId).toBe('user-1');
      expect(token.type).toBe(UserTokenType.INVITATION);
      expect(token.attempts).toBe(0);
      expect(token.usedAt).toBeNull();
      expect(token.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(48 * 60 * MINUTE_IN_MS);
      expect(token.isUsable()).toBe(true);
    });

    it.each([
      [UserTokenType.PASSWORD_RESET, 60],
      [UserTokenType.EMAIL_VERIFICATION, 24 * 60],
    ] as const)('deve emitir o token de link do tipo %s', (type, validForMinutes) => {
      const { token, secret } = UserToken.issue({ userId: 'user-1', type, validForMinutes });

      expect(token.type).toBe(type);
      expect(token.tokenHash).toBe(UserToken.hash(secret));
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(
        validForMinutes * MINUTE_IN_MS,
      );
    });

    it('deve guardar só o hash SHA-256 do segredo, que vai no link', () => {
      const { token, secret } = UserToken.issue({
        userId: 'user-1',
        type: UserTokenType.INVITATION,
        validForMinutes: 60,
      });

      expect(secret).toMatch(/^[\w-]{43}$/);
      expect(token.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
      expect(token.tokenHash).not.toContain(secret);
      expect(JSON.stringify(token)).not.toContain(secret);
    });

    it('deve gerar um segredo diferente a cada emissão', () => {
      const input = { userId: 'user-1', type: UserTokenType.INVITATION, validForMinutes: 60 };

      const first = UserToken.issue(input);
      const second = UserToken.issue(input);

      expect(second.secret).not.toBe(first.secret);
      expect(second.token.tokenHash).not.toBe(first.token.tokenHash);
      expect(second.token.id).not.toBe(first.token.id);
    });
  });

  describe('issueCode', () => {
    it('deve emitir um código de 6 dígitos do tipo LOGIN_CODE, com a validade informada', () => {
      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });

      expect(secret).toMatch(/^\d{6}$/);
      expect(token.userId).toBe('user-1');
      expect(token.type).toBe(UserTokenType.LOGIN_CODE);
      expect(token.attempts).toBe(0);
      expect(token.usedAt).toBeNull();
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(10 * MINUTE_IN_MS);
      expect(token.isUsable()).toBe(true);
    });

    it('deve sortear o código com crypto.randomInt e manter os zeros à esquerda', () => {
      const randomInt = jest.spyOn(crypto, 'randomInt').mockImplementation(() => 42);

      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });

      expect(randomInt).toHaveBeenCalledWith(1_000_000);
      expect(secret).toBe('000042');
      expect(token.matchesCode('000042')).toBe(true);
      expect(token.matchesCode('42')).toBe(false);
    });

    it('deve guardar só o hash do código, calculado junto com o id do usuário', () => {
      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });

      expect(token.tokenHash).toBe(UserToken.hashCode('user-1', secret));
      expect(token.tokenHash).not.toBe(UserToken.hash(secret));
      expect(JSON.stringify(token)).not.toContain(`"${secret}"`);
    });
  });

  describe('hash', () => {
    it('deve gerar sempre o mesmo hash de 64 caracteres hexadecimais para o mesmo segredo', () => {
      expect(UserToken.hash('segredo')).toBe(UserToken.hash('segredo'));
      expect(UserToken.hash('segredo')).toMatch(/^[0-9a-f]{64}$/);
      expect(UserToken.hash('outro')).not.toBe(UserToken.hash('segredo'));
    });
  });

  describe('hashCode', () => {
    it('deve gerar hashes diferentes para o mesmo código em usuários diferentes', () => {
      // O token_hash é UNIQUE, e dois usuários podem receber o mesmo código ao mesmo tempo.
      expect(UserToken.hashCode('user-1', '123456')).toBe(UserToken.hashCode('user-1', '123456'));
      expect(UserToken.hashCode('user-1', '123456')).toMatch(/^[0-9a-f]{64}$/);
      expect(UserToken.hashCode('user-2', '123456')).not.toBe(
        UserToken.hashCode('user-1', '123456'),
      );
    });
  });

  describe('restore', () => {
    it('deve reconstruir o token sem alterar os dados', () => {
      const usedAt = new Date('2026-09-29T08:00:00.000Z');

      const sut = restore({ usedAt, attempts: 2 });

      expect(sut.id).toBe('token-1');
      expect(sut.userId).toBe('user-1');
      expect(sut.tokenHash).toBe('a'.repeat(64));
      expect(sut.attempts).toBe(2);
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

    it('deve aceitar o código com 4 erros e recusar com 5', () => {
      const now = new Date('2026-09-29T08:00:00.000Z');

      expect(restore({ type: UserTokenType.LOGIN_CODE, attempts: 4 }).isUsable(now)).toBe(true);
      expect(restore({ type: UserTokenType.LOGIN_CODE, attempts: 5 }).isUsable(now)).toBe(false);
    });
  });

  describe('wasIssuedRecently', () => {
    it('deve indicar o token emitido há menos de 1 minuto (RN20)', () => {
      const sut = restore();

      expect(sut.wasIssuedRecently(new Date('2026-09-28T12:00:00.000Z'))).toBe(true);
      expect(sut.wasIssuedRecently(new Date('2026-09-28T12:00:59.999Z'))).toBe(true);
    });

    it('não deve indicar o token emitido há 1 minuto ou mais', () => {
      const sut = restore();

      expect(sut.wasIssuedRecently(new Date('2026-09-28T12:01:00.000Z'))).toBe(false);
      expect(sut.wasIssuedRecently(new Date('2026-09-28T13:00:00.000Z'))).toBe(false);
    });

    it('deve indicar o token recém-emitido, mesmo depois de usado', () => {
      const { token } = UserToken.issue({
        userId: 'user-1',
        type: UserTokenType.PASSWORD_RESET,
        validForMinutes: 60,
      });
      token.use();

      expect(token.wasIssuedRecently()).toBe(true);
    });
  });

  describe('matchesCode', () => {
    it('deve conferir o código emitido', () => {
      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });
      const wrong = secret === '000000' ? '000001' : '000000';

      expect(token.matchesCode(secret)).toBe(true);
      expect(token.matchesCode(wrong)).toBe(false);
      expect(token.matchesCode('')).toBe(false);
    });

    it('não deve aceitar o código de outro usuário', () => {
      const code = '123456';
      const sut = restore({
        type: UserTokenType.LOGIN_CODE,
        tokenHash: UserToken.hashCode('user-1', code),
      });
      const other = restore({
        userId: 'user-2',
        type: UserTokenType.LOGIN_CODE,
        tokenHash: UserToken.hashCode('user-1', code),
      });

      expect(sut.matchesCode(code)).toBe(true);
      expect(other.matchesCode(code)).toBe(false);
    });

    it('não deve aceitar o segredo de um token de link como código', () => {
      const { token, secret } = UserToken.issue({
        userId: 'user-1',
        type: UserTokenType.PASSWORD_RESET,
        validForMinutes: 60,
      });

      expect(token.matchesCode(secret)).toBe(false);
    });
  });

  describe('registerFailedAttempt', () => {
    it('deve contar cada erro na conferência do código', () => {
      const { token } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });

      token.registerFailedAttempt();
      token.registerFailedAttempt();

      expect(token.attempts).toBe(2);
      expect(token.isUsable()).toBe(true);
    });

    it('deve invalidar o código no 5º erro, mesmo que a tentativa seguinte esteja certa (RN25)', () => {
      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });

      for (let attempt = 1; attempt <= LOGIN_CODE_MAX_ATTEMPTS; attempt++) {
        expect(token.isUsable()).toBe(true);
        token.registerFailedAttempt();
      }

      expect(token.attempts).toBe(5);
      expect(token.matchesCode(secret)).toBe(true);
      expect(token.isUsable()).toBe(false);
      expect(() => token.use()).toThrow(InvalidUserTokenError);
      expect(token.usedAt).toBeNull();
    });

    it('não deve passar do limite de erros', () => {
      const sut = restore({ type: UserTokenType.LOGIN_CODE, attempts: 5 });

      sut.registerFailedAttempt();

      expect(sut.attempts).toBe(5);
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

    it('deve registrar o uso de um código conferido antes do 5º erro', () => {
      const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });
      token.registerFailedAttempt();

      expect(token.matchesCode(secret)).toBe(true);
      token.use();

      expect(token.usedAt).toBeInstanceOf(Date);
      expect(token.isUsable()).toBe(false);
    });
  });
});
