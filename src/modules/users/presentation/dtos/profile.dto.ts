import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { ChangePasswordInput } from '../../application/use-cases/change-password.use-case';
import type { DeleteOwnAccountInput } from '../../application/use-cases/delete-own-account.use-case';
import type { UpdateProfileInput } from '../../application/use-cases/update-profile.use-case';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';
import { userNameSchema } from './user-name.schema';

/**
 * Corpo do `PATCH /api/users/me`. Os campos são opcionais, mas pelo menos um é obrigatório.
 * E-mail e CPF não são editáveis e, se enviados, são ignorados.
 */
export const updateProfileBodySchema = z
  .object({
    name: userNameSchema.optional(),
    phone: domainString((value) => Phone.create(value)).optional(),
    birthDate: domainString((value) => BirthDate.create(value)).optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    'Informe pelo menos um campo para alterar.',
  ) satisfies z.ZodType<Omit<UpdateProfileInput, 'userId'>>;

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

/**
 * Corpo do `PATCH /api/users/me/password`. A senha atual não passa pela política, porque uma
 * senha antiga pode não segui-la; só a nova passa (RN08).
 */
export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'A senha atual é obrigatória.'),
  newPassword: domainString((value) => Password.create(value)),
}) satisfies z.ZodType<Omit<ChangePasswordInput, 'userId' | 'sessionHandle'>>;

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

/** Corpo do `DELETE /api/users/me`: a senha atual confirma a exclusão (RN15). */
export const deleteOwnAccountBodySchema = z.object({
  password: z.string().min(1, 'A senha é obrigatória.'),
}) satisfies z.ZodType<Omit<DeleteOwnAccountInput, 'userId'>>;

export type DeleteOwnAccountBody = z.infer<typeof deleteOwnAccountBodySchema>;
