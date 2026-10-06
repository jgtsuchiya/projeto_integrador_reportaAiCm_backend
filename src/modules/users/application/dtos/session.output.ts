import { IdentitySession } from '../ports/identity-provider';

/** Sessão aberta do usuário logado, como é devolvida no `GET /api/users/me/sessions`. */
export interface SessionOutput {
  /** Identifica a sessão no `DELETE /api/users/me/sessions/:id`. */
  id: string;
  /** Data do login. */
  createdAt: Date;
  /** Quando a sessão deixa de ser renovada. Cada renovação adia essa data. */
  expiresAt: Date;
  /** IP do login. Nulo nas sessões abertas antes de a origem do login ser guardada. */
  ipAddress: string | null;
  /** User agent do login. Nulo nos mesmos casos do IP. */
  userAgent: string | null;
  /** true só na sessão que fez a requisição. */
  current: boolean;
}

export function toSessionOutput(
  session: IdentitySession,
  currentSessionHandle: string,
): SessionOutput {
  return {
    id: session.handle,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    current: session.handle === currentSessionHandle,
  };
}
