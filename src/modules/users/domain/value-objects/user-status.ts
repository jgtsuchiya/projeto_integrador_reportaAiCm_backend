/**
 * Status de acesso do usuário. PENDING só existe para o ADMIN convidado que ainda não
 * aceitou o convite. As transições ficam na entidade `User`.
 */
export const UserStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
