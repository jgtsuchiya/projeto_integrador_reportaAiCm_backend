import { z } from 'zod';

import { domainString } from '@shared/presentation/validation/domain-string.schema';

import type { RegisterClientInput } from '../../application/use-cases/register-client.use-case';
import { BirthDate } from '../../domain/value-objects/birth-date';
import { Cpf } from '../../domain/value-objects/cpf';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Phone } from '../../domain/value-objects/phone';
import { userNameSchema } from './user-name.schema';

/** Corpo do `POST /api/clients`. As regras de cada campo são as dos value objects do domínio. */
export const registerClientBodySchema = z.object({
  name: userNameSchema,
  email: domainString((value) => Email.create(value)),
  password: domainString((value) => Password.create(value)),
  cpf: domainString((value) => Cpf.create(value)),
  phone: domainString((value) => Phone.create(value)),
  birthDate: domainString((value) => BirthDate.create(value)),
}) satisfies z.ZodType<RegisterClientInput>;

export type RegisterClientBody = z.infer<typeof registerClientBodySchema>;
