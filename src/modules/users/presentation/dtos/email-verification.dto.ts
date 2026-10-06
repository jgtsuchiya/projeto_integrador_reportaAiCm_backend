import { z } from 'zod';

import type { VerifyEmailInput } from '../../application/use-cases/verify-email.use-case';
import { linkTokenSchema } from './link-token.schema';

/** Corpo do `POST /api/email-verifications/confirm`. */
export const confirmEmailVerificationBodySchema = z.object({
  token: linkTokenSchema,
}) satisfies z.ZodType<VerifyEmailInput>;

export type ConfirmEmailVerificationBody = z.infer<typeof confirmEmailVerificationBodySchema>;
