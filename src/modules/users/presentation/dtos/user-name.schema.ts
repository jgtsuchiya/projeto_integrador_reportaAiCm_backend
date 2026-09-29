import { z } from 'zod';

import { USER_NAME_MAX_LENGTH } from '../../domain/entities/user.entity';

/** Nome de qualquer usuário, com as mesmas regras da entidade `User`. */
export const userNameSchema = z
  .string()
  .trim()
  .min(1, 'O nome é obrigatório.')
  .max(USER_NAME_MAX_LENGTH, `O nome deve ter no máximo ${USER_NAME_MAX_LENGTH} caracteres.`);
