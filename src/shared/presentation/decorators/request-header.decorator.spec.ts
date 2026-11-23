import { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { readRequestHeader } from './request-header.decorator';

function createContext(headers: Record<string, string>): ExecutionContext {
  const request = {
    get: (name: string) => headers[name.toLowerCase()],
  } as Partial<Request>;

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RequestHeader', () => {
  it('deve ler o header pelo nome, sem diferenciar maiúsculas', () => {
    const context = createContext({ 'idempotency-key': 'chave-1' });

    expect(readRequestHeader('Idempotency-Key', context)).toBe('chave-1');
  });

  it('deve retornar undefined quando o header não foi enviado', () => {
    expect(readRequestHeader('Idempotency-Key', createContext({}))).toBeUndefined();
  });
});
