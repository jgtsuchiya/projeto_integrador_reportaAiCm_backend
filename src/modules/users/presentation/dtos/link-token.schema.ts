import { z } from 'zod';

/** O token gerado tem 43 caracteres. O limite só evita calcular o hash de um valor enorme. */
const TOKEN_MAX_LENGTH = 256;

/** Token recebido no link de um e-mail (convite ou redefinição de senha), como veio na URL. */
export const linkTokenSchema = z
  .string()
  .trim()
  .min(1, 'O token é obrigatório.')
  .max(TOKEN_MAX_LENGTH, 'Link inválido, expirado ou já utilizado.');
