import {
  buildSessionOrigin,
  readSessionOrigin,
  SESSION_USER_AGENT_MAX_LENGTH,
} from './session-origin';

describe('buildSessionOrigin', () => {
  it('deve guardar o IP e o user agent da requisição', () => {
    const origin = buildSessionOrigin({
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (Linux; Android 16)',
    });

    expect(origin).toEqual({
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (Linux; Android 16)',
    });
  });

  it('deve aceitar um IPv6', () => {
    expect(buildSessionOrigin({ ipAddress: '2001:db8::1' }).ipAddress).toBe('2001:db8::1');
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['vazio', ''],
    ['que não é um endereço', 'nao-e-um-ip'],
  ])('não deve guardar um IP %s', (_case, ipAddress) => {
    expect(buildSessionOrigin({ ipAddress }).ipAddress).toBeNull();
  });

  it('deve cortar o user agent no tamanho máximo', () => {
    const { userAgent } = buildSessionOrigin({ userAgent: 'a'.repeat(300) });

    expect(SESSION_USER_AGENT_MAX_LENGTH).toBe(255);
    expect(userAgent).toBe('a'.repeat(255));
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['vazio', ''],
  ])('não deve guardar um user agent %s', (_case, userAgent) => {
    expect(buildSessionOrigin({ userAgent }).userAgent).toBeNull();
  });
});

describe('readSessionOrigin', () => {
  it('deve ler a origem gravada pelo buildSessionOrigin', () => {
    const origin = buildSessionOrigin({ ipAddress: '203.0.113.10', userAgent: 'Mozilla/5.0' });

    expect(readSessionOrigin(origin)).toEqual(origin);
  });

  it('deve ignorar os outros dados da sessão', () => {
    const origin = readSessionOrigin({ ipAddress: '203.0.113.10', outro: 'dado' });

    expect(origin).toEqual({ ipAddress: '203.0.113.10', userAgent: null });
  });

  it.each([
    ['vazios, como nas sessões abertas antes de a origem ser guardada', {}],
    ['ausentes', undefined],
    ['nulos', null],
    ['com a origem nula', { ipAddress: null, userAgent: null }],
    ['com valores que não são texto', { ipAddress: 123, userAgent: ['Mozilla/5.0'] }],
  ])('deve devolver a origem vazia para os dados %s', (_case, sessionData) => {
    expect(readSessionOrigin(sessionData)).toEqual({ ipAddress: null, userAgent: null });
  });
});
