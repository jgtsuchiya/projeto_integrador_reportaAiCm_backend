import { Email } from '../value-objects/email';
import {
  LOGIN_ATTEMPT_RETENTION_DAYS,
  LOGIN_ATTEMPT_USER_AGENT_MAX_LENGTH,
  LoginAttempt,
} from './login-attempt.entity';

describe('LoginAttempt', () => {
  const NOW = new Date('2026-10-06T12:00:00.000Z');
  const email = Email.create('maria@example.com');

  function record(
    overrides: Partial<Parameters<typeof LoginAttempt.record>[0]> = {},
  ): LoginAttempt {
    return LoginAttempt.record({
      email,
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (Linux; Android 16)',
      succeeded: false,
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deve registrar a tentativa com o e-mail, a origem, o resultado e o horário', () => {
    const sut = record();

    expect(sut.id).toEqual(expect.any(String));
    expect(sut.email).toBe(email);
    expect(sut.ipAddress).toBe('203.0.113.10');
    expect(sut.userAgent).toBe('Mozilla/5.0 (Linux; Android 16)');
    expect(sut.succeeded).toBe(false);
    expect(sut.createdAt).toEqual(NOW);
  });

  it('deve registrar uma tentativa com sucesso', () => {
    expect(record({ succeeded: true }).succeeded).toBe(true);
  });

  it('deve dar um id próprio a cada tentativa', () => {
    expect(record().id).not.toBe(record().id);
  });

  it.each(['2001:db8:85a3::8a2e:370:7334', '::ffff:203.0.113.10', '::1'])(
    'deve guardar o IPv6 %s',
    (ipAddress) => {
      expect(record({ ipAddress }).ipAddress).toBe(ipAddress);
    },
  );

  it.each([
    ['ausente', null],
    ['vazio', ''],
    ['que não é um endereço', 'unknown'],
    ['com mais de um endereço', '203.0.113.10, 198.51.100.7'],
    ['maior que a coluna', `fe80::1%${'a'.repeat(45)}`],
  ])('deve registrar sem IP quando ele vem %s', (_case, ipAddress) => {
    expect(record({ ipAddress }).ipAddress).toBeNull();
  });

  it('deve cortar o user agent no tamanho da coluna', () => {
    const userAgent = 'a'.repeat(LOGIN_ATTEMPT_USER_AGENT_MAX_LENGTH + 50);

    const sut = record({ userAgent });

    expect(sut.userAgent).toBe('a'.repeat(LOGIN_ATTEMPT_USER_AGENT_MAX_LENGTH));
  });

  it.each([
    ['ausente', null],
    ['vazio', ''],
  ])('deve registrar sem user agent quando ele vem %s', (_case, userAgent) => {
    expect(record({ userAgent }).userAgent).toBeNull();
  });

  it('deve guardar as tentativas por 30 dias (RN19)', () => {
    expect(LOGIN_ATTEMPT_RETENTION_DAYS).toBe(30);
  });
});
