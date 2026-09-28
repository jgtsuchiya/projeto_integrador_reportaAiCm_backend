import { ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../authenticated-request';
import { getCurrentUser } from './current-user.decorator';

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser', () => {
  it('deve retornar o usuário carregado pelo AuthGuard', () => {
    const user = { id: 'user-1', role: 'CLIENT' as const };

    const result = getCurrentUser(createContext({ user }));

    expect(result).toBe(user);
  });

  it('deve falhar quando usado numa rota sem autenticação', () => {
    expect(() => getCurrentUser(createContext({}))).toThrow(
      '@CurrentUser() usado numa rota sem autenticação.',
    );
  });
});
