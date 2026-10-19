import { ExecutionContext } from '@nestjs/common';
import type { SessionContainer } from 'supertokens-node/recipe/session';

import type { AuthenticatedRequest } from '../authenticated-request';
import { getCurrentSession } from './current-session.decorator';

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CurrentSession', () => {
  it('deve retornar a sessão verificada pelo AuthGuard', () => {
    const session = { getHandle: () => 'session-1' } as SessionContainer;

    const result = getCurrentSession(createContext({ session }));

    expect(result).toBe(session);
  });

  it('deve falhar quando usado numa rota sem autenticação', () => {
    expect(() => getCurrentSession(createContext({}))).toThrow(
      '@CurrentSession() usado numa rota sem autenticação.',
    );
  });
});
