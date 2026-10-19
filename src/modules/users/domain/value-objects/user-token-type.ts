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

/**
 * Tipos enviados como link, com um segredo de 256 bits. O `LOGIN_CODE` fica de fora: é um
 * código de 6 dígitos, emitido por `UserToken.issueCode`.
 */
export type UserLinkTokenType = Exclude<UserTokenType, typeof UserTokenType.LOGIN_CODE>;
