import { z } from 'zod';

import type { VerifyLoginCodeInput } from '../../application/use-cases/verify-login-code.use-case';
import { LOGIN_CODE_LENGTH } from '../../domain/entities/user-token.entity';

/**
 * Corpo do `POST /api/mfa/verify`. O usuário vem da sessão pendente. Um código fora do formato
 * responde 400 e não conta como erro na conferência: ele nunca seria o código enviado.
 */
export const verifyLoginCodeBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`), `O código tem ${LOGIN_CODE_LENGTH} dígitos.`),
}) satisfies z.ZodType<Omit<VerifyLoginCodeInput, 'userId'>>;

export type VerifyLoginCodeBody = z.infer<typeof verifyLoginCodeBodySchema>;
