import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { AcceptInvitationInput } from '../../application/use-cases/accept-invitation.use-case';
import { Password } from '../../domain/value-objects/password';
import { linkTokenSchema } from './link-token.schema';

/** Corpo do `POST /api/invitations/accept`. */
export const acceptInvitationBodySchema = z.object({
  token: linkTokenSchema,
  password: domainString((value) => Password.create(value)),
}) satisfies z.ZodType<AcceptInvitationInput>;

export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;
