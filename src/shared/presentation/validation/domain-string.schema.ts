import { z } from 'zod';

import { DomainError } from '@shared/domain/errors/domain.error';

/**
 * String validada pela fábrica de um value object do domínio, para o `ZodValidationPipe`
 * responder 400 com todos os campos inválidos de uma vez, sem repetir as regras no schema:
 *
 * ```ts
 * const bodySchema = z.object({ cpf: domainString((value) => Cpf.create(value)) });
 * ```
 *
 * A mensagem do erro de domínio vira a mensagem do campo. O valor segue sem transformação:
 * o caso de uso cria o value object de novo e continua sendo quem garante a regra.
 */
export function domainString(create: (raw: string) => unknown): z.ZodString {
  return z.string().superRefine((value, context) => {
    try {
      create(value);
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }

      context.addIssue({ code: 'custom', message: error.message });
    }
  });
}
