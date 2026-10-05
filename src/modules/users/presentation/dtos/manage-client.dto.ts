import { z } from 'zod';

import { pageRequestSchema } from '@shared/presentation/pagination/page-request.schema';

import type { ChangeClientStatusInput } from '../../application/use-cases/change-client-status.use-case';
import type { ListClientsInput } from '../../application/use-cases/list-clients.use-case';
import { UserStatus } from '../../domain/value-objects/user-status';

/** Maior busca útil: o tamanho máximo do e-mail. */
const SEARCH_MAX_LENGTH = 254;

/**
 * Query do `GET /api/clients` (`?page=1&pageSize=20&status=ACTIVE&search=maria`). Uma busca
 * vazia é o mesmo que não buscar. O CLIENT nunca fica PENDING, então esse status não é aceito.
 */
export const listClientsQuerySchema = pageRequestSchema.extend({
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]).optional(),
  search: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH, `A busca deve ter no máximo ${SEARCH_MAX_LENGTH} caracteres.`)
    .transform((value) => value || undefined)
    .optional(),
}) satisfies z.ZodType<ListClientsInput>;

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

/** Corpo do `PATCH /api/clients/:id/status`. */
export const changeClientStatusBodySchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]),
}) satisfies z.ZodType<Omit<ChangeClientStatusInput, 'clientId'>>;

export type ChangeClientStatusBody = z.infer<typeof changeClientStatusBodySchema>;
