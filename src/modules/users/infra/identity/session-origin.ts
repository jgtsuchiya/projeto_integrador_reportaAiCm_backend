import { isIP } from 'node:net';

/** O header vem da requisição e pode ser bem maior do que vale a pena guardar e exibir. */
export const SESSION_USER_AGENT_MAX_LENGTH = 255;

/**
 * Origem do login (RN23), como fica nos dados da sessão no SuperTokens Core
 * (`sessionDataInDatabase`). Quem grava é o override de `createNewSession`, no módulo `auth`,
 * e quem lê é o `SuperTokensIdentityProvider`.
 */
export interface SessionOrigin {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * O IP e o user agent vêm da requisição, então são ajustados antes de ir para o Core: o user
 * agent é cortado, e um IP que não é um endereço válido não é guardado.
 */
export function buildSessionOrigin(request: {
  ipAddress?: string | null;
  userAgent?: string | null;
}): SessionOrigin {
  const { ipAddress, userAgent } = request;

  return {
    ipAddress: ipAddress && isIP(ipAddress) !== 0 ? ipAddress : null,
    userAgent: userAgent?.slice(0, SESSION_USER_AGENT_MAX_LENGTH) || null,
  };
}

/**
 * Lê a origem dos dados de uma sessão. As sessões abertas antes de a origem ser guardada não
 * a têm, e aparecem sem IP e sem user agent.
 */
export function readSessionOrigin(sessionData: unknown): SessionOrigin {
  const data = (sessionData ?? {}) as Record<string, unknown>;

  return {
    ipAddress: typeof data.ipAddress === 'string' ? data.ipAddress : null,
    userAgent: typeof data.userAgent === 'string' ? data.userAgent : null,
  };
}
