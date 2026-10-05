import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { AcceptInvitationInput } from '../../application/use-cases/accept-invitation.use-case';
import { Password } from '../../domain/value-objects/password';

/** O token gerado tem 43 caracteres. O limite só evita calcular o hash de um valor enorme. */
const TOKEN_MAX_LENGTH = 256;

/** Corpo do `POST /api/invitations/accept`. */
export const acceptInvitationBodySchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'O token é obrigatório.')
    .max(TOKEN_MAX_LENGTH, 'Link inválido, expirado ou já utilizado.'),
  password: domainString((value) => Password.create(value)),
}) satisfies z.ZodType<AcceptInvitationInput>;

export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;
