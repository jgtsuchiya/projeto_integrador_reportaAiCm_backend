const KILOBYTE = 1024;
const MEGABYTE = 1024 * KILOBYTE;

/**
 * Tamanho em bytes no formato das mensagens ao usuário: `2 MB`, `100 KB`, `2,8 MB` ou
 * `512 bytes`. As unidades são binárias (1 KB = 1024 bytes), como nas variáveis de ambiente.
 * A casa decimal é cortada, e não arredondada, para a mensagem nunca mostrar um limite maior
 * que o real.
 */
export function formatByteSize(bytes: number): string {
  if (bytes >= MEGABYTE) {
    return `${formatDecimal(bytes / MEGABYTE)} MB`;
  }

  if (bytes >= KILOBYTE) {
    return `${formatDecimal(bytes / KILOBYTE)} KB`;
  }

  return bytes === 1 ? '1 byte' : `${bytes} bytes`;
}

function formatDecimal(value: number): string {
  return String(Math.floor(value * 10) / 10).replace('.', ',');
}
