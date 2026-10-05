/**
 * Tipos de token de uso único enviados por e-mail. Os códigos são os mesmos do
 * `user_tokens.type`, e um tipo novo também entra por migration.
 */
export const UserTokenType = {
  INVITATION: 'INVITATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  LOGIN_CODE: 'LOGIN_CODE',
} as const;

export type UserTokenType = (typeof UserTokenType)[keyof typeof UserTokenType];
