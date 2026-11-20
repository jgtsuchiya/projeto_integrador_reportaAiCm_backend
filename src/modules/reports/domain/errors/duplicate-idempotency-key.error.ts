import { ConflictError } from '@shared/domain/errors/conflict.error';

/**
 * RN31: o autor já abriu um reporte com a mesma `Idempotency-Key`. É o que o repositório lança
 * quando dois pedidos com a mesma chave chegam juntos: o caso de uso o trata devolvendo o
 * reporte que o primeiro pedido gravou.
 */
export class DuplicateIdempotencyKeyError extends ConflictError {
  constructor() {
    super('Já existe um reporte aberto com esta Idempotency-Key.', { field: 'Idempotency-Key' });
  }
}
