/**
 * Papéis de acesso (RN01). Os códigos são os mesmos da tabela `roles` e do UserRoles
 * do SuperTokens.
 */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  CLIENT: 'CLIENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ROLES: readonly Role[] = Object.values(Role);

/**
 * Hierarquia de gestão de usuários:
 * - ninguém gerencia um SUPER_ADMIN (RN03);
 * - só o SUPER_ADMIN gerencia ADMINs (RN04);
 * - ADMIN e SUPER_ADMIN gerenciam CLIENTs (RN12).
 */
export function canManage(actor: Role, target: Role): boolean {
  switch (target) {
    case Role.SUPER_ADMIN:
      return false;
    case Role.ADMIN:
      return actor === Role.SUPER_ADMIN;
    case Role.CLIENT:
      return actor === Role.SUPER_ADMIN || actor === Role.ADMIN;
  }
}
