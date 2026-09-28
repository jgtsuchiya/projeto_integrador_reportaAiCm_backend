import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { middleware } from 'supertokens-node/framework/express';

/**
 * Atende as rotas nativas do SuperTokens em `/api/auth` (signin, session/refresh, signout...).
 * As demais requisições seguem para os controllers da aplicação.
 */
@Injectable()
export class SuperTokensMiddleware implements NestMiddleware {
  private readonly handler = middleware();

  use(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.handler(req, res, next);
  }
}
