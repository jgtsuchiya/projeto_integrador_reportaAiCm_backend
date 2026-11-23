/**
 * Conversão entre os bytes e o base64 do JSON (RFC 4648, alfabeto padrão, com o `=` do fim).
 * Os bytes são `Uint8Array`, para o domínio continuar sem o `Buffer` do Node.
 */

/** Só o alfabeto padrão, com o `=` apenas no fim. Sem quebra de linha e sem o prefixo `data:`. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * O texto não é base64 no formato aceito. A mensagem não traz o texto: ele pode ser uma foto,
 * que não vai para o log (RN36).
 */
export class InvalidBase64Error extends Error {
  constructor() {
    super('O texto não está em base64.');
    this.name = InvalidBase64Error.name;
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

/**
 * Decode estrito: recusa o caractere fora do alfabeto, a falta do `=` do fim, a quebra de
 * linha, o prefixo `data:` e os bits de sobra diferentes de zero, com que dois textos diferentes
 * dariam os mesmos bytes. O `Buffer.from(text, 'base64')` do Node ignora os caracteres
 * inválidos em silêncio, então o resultado é conferido codificando os bytes de novo.
 */
export function decodeBase64(text: string): Uint8Array {
  if (!BASE64_PATTERN.test(text)) {
    throw new InvalidBase64Error();
  }

  const buffer = Buffer.from(text, 'base64');
  if (buffer.toString('base64') !== text) {
    throw new InvalidBase64Error();
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Tamanho do texto em base64, com o `=` do fim, de um conteúdo com `byteLength` bytes. */
export function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}
