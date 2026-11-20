import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export function readRequestHeader(name: string, context: ExecutionContext): string | undefined {
  return context.switchToHttp().getRequest<Request>().get(name);
}

/**
 * Header da requisição, pelo nome. Ao contrário do `@Headers()` do Nest, passa pelos pipes:
 * aceita o schema como os outros parâmetros, e o erro de validação sai com o nome do header no
 * `field`.
 *
 * ```ts
 * create(@RequestHeader('Idempotency-Key', { schema: z.uuid().optional() }) key?: string)
 * ```
 */
export const RequestHeader = createParamDecorator((name: string, context: ExecutionContext) =>
  readRequestHeader(name, context),
);
