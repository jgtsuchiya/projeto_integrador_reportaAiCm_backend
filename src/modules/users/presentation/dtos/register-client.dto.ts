import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { RegisterClientInput } from '../../application/use-cases/register-client.use-case';
import { USER_NAME_MAX_LENGTH } from '../../domain/entities/user.entity';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';

/** Corpo do `POST /api/clients`. As regras de cada campo são as dos value objects do domínio. */
export const registerClientBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'O nome é obrigatório.')
    .max(USER_NAME_MAX_LENGTH, `O nome deve ter no máximo ${USER_NAME_MAX_LENGTH} caracteres.`),
  email: domainString((value) => Email.create(value)),
  password: domainString((value) => Password.create(value)),
  cpf: domainString((value) => Cpf.create(value)),
  phone: domainString((value) => Phone.create(value)),
  birthDate: domainString((value) => BirthDate.create(value)),
}) satisfies z.ZodType<RegisterClientInput>;

export type RegisterClientBody = z.infer<typeof registerClientBodySchema>;
