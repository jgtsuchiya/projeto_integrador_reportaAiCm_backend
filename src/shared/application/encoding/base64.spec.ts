import { base64Length, decodeBase64, encodeBase64, InvalidBase64Error } from './base64';

describe('base64', () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

  it('deve codificar e decodificar de volta os mesmos bytes', () => {
    const text = encodeBase64(bytes);

    expect(text).toBe('/9j/4AAQSkZJRgA=');
    expect(decodeBase64(text)).toEqual(bytes);
  });

  it.each([
    ['tamanho múltiplo de 3', new Uint8Array([1, 2, 3])],
    ['um byte de sobra', new Uint8Array([1, 2, 3, 4])],
    ['dois bytes de sobra', new Uint8Array([1, 2, 3, 4, 5])],
    ['nenhum byte', new Uint8Array([])],
  ])('deve fazer a volta completa com %s', (_case, input) => {
    expect(decodeBase64(encodeBase64(input))).toEqual(input);
  });

  it('deve codificar só a parte do buffer que o Uint8Array enxerga', () => {
    const view = new Uint8Array([9, 9, 1, 2, 3, 9]).subarray(2, 5);

    expect(encodeBase64(view)).toBe(encodeBase64(new Uint8Array([1, 2, 3])));
  });

  it('deve devolver um Uint8Array, e não um Buffer do Node', () => {
    const result = decodeBase64('AQID');

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(result)).toBe(false);
  });

  it.each([
    ['caractere fora do alfabeto', '/9j/4AAQ*kZJRgA='],
    ['base64url', '_9j_4AAQSkZJRgA='],
    ['sem o "=" do fim', '/9j/4AAQSkZJRgA'],
    ['com quebra de linha', '/9j/4AAQ\nSkZJRgA='],
    ['com espaço', '/9j/4AAQ SkZJRgA='],
    ['com o prefixo data:', 'data:image/jpeg;base64,/9j/4AAQSkZJRgA='],
    ['com "=" no meio', '/9j=4AAQSkZJRgA='],
    ['com bits de sobra diferentes de zero', 'AB=='],
    ['com "=" demais', 'AQID===='],
  ])('deve recusar o texto %s', (_case, text) => {
    expect(() => decodeBase64(text)).toThrow(InvalidBase64Error);
  });

  it('deve recusar sem repetir o texto na mensagem do erro', () => {
    let failure: unknown;

    try {
      decodeBase64('segredo*');
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(InvalidBase64Error);
    expect((failure as Error).message).not.toContain('segredo');
  });

  it.each([
    [0, 0],
    [1, 4],
    [3, 4],
    [4, 8],
    [2 * 1024 * 1024, 2796204],
  ])('deve calcular o tamanho em base64 de %i bytes: %i', (byteLength, expected) => {
    expect(base64Length(byteLength)).toBe(expected);
    expect(encodeBase64(new Uint8Array(byteLength))).toHaveLength(expected);
  });
});
