import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { InviteAdminInput } from '../../application/use-cases/invite-admin.use-case';
import { Email } from '../../domain/value-objects/email';
import { userNameSchema } from './user-name.schema';

/** Corpo do `POST /api/admins`. Quem convida vem da sessão, não do corpo. */
export const inviteAdminBodySchema = z.object({
  name: userNameSchema,
  email: domainString((value) => Email.create(value)),
}) satisfies z.ZodType<Omit<InviteAdminInput, 'invitedById'>>;

export type InviteAdminBody = z.infer<typeof inviteAdminBodySchema>;
