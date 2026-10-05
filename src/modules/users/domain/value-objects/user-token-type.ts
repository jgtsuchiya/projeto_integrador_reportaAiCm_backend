/**
 * Tipos de token de uso único enviados por e-mail. Os códigos são os mesmos do
 * `user_tokens.type`, e um tipo novo também entra por migration.
 */
export const UserTokenType = {
  INVITATION: 'INVITATION',
} as const;

export type UserTokenType = (typeof UserTokenType)[keyof typeof UserTokenType];
