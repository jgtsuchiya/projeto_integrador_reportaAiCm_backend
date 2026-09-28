import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PageRequest } from '@shared/domain/pagination';

/**
 * Query string de paginação (`?page=2&pageSize=50`).
 * As listagens estendem este schema com os próprios filtros:
 *
 * ```ts
 * const listClientsQuerySchema = pageRequestSchema.extend({ status: z.enum([...]).optional() });
 * ```
 */
export const pageRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
}) satisfies z.ZodType<PageRequest>;
