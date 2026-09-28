import { z } from 'zod';

import { pageRequestSchema } from '@shared/presentation/pagination/page-request.schema';

import type { ChangeAdminStatusInput } from '../../application/use-cases/change-admin-status.use-case';
import type { ListAdminsInput } from '../../application/use-cases/list-admins.use-case';
import type { UpdateAdminInput } from '../../application/use-cases/update-admin.use-case';
import { UserStatus } from '../../domain/value-objects/user-status';
import { userNameSchema } from './user-name.schema';

/** Query do `GET /api/admins` (`?page=1&pageSize=20&status=PENDING`). */
export const listAdminsQuerySchema = pageRequestSchema.extend({
  status: z.enum([UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.INACTIVE]).optional(),
}) satisfies z.ZodType<ListAdminsInput>;

export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>;

/** Corpo do `PATCH /api/admins/:id`. Só o nome é editável. */
export const updateAdminBodySchema = z.object({
  name: userNameSchema,
}) satisfies z.ZodType<Omit<UpdateAdminInput, 'adminId'>>;

export type UpdateAdminBody = z.infer<typeof updateAdminBodySchema>;

/** Corpo do `PATCH /api/admins/:id/status`. PENDING não é aceito: só o aceite do convite ativa. */
export const changeAdminStatusBodySchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]),
}) satisfies z.ZodType<Omit<ChangeAdminStatusInput, 'adminId'>>;

export type ChangeAdminStatusBody = z.infer<typeof changeAdminStatusBodySchema>;
