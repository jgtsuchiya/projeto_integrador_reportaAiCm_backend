import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { RequestPasswordResetInput } from '../../application/use-cases/request-password-reset.use-case';
import type { ResetPasswordInput } from '../../application/use-cases/reset-password.use-case';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { linkTokenSchema } from './link-token.schema';

/**
 * Corpo do `POST /api/password-resets`. Um e-mail fora do formato responde 400, o que não
 * revela nada: a resposta só depende do texto enviado, e não de existir uma conta.
 */
export const requestPasswordResetBodySchema = z.object({
  email: domainString((value) => Email.create(value)),
}) satisfies z.ZodType<RequestPasswordResetInput>;

export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;

/** Corpo do `POST /api/password-resets/confirm`. */
export const resetPasswordBodySchema = z.object({
  token: linkTokenSchema,
  password: domainString((value) => Password.create(value)),
}) satisfies z.ZodType<ResetPasswordInput>;

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
