import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Error as SuperTokensError } from 'supertokens-node';
import { errorHandler } from 'supertokens-node/framework/express';

import { GlobalExceptionFilter } from '@shared/presentation/filters/global-exception.filter';

/**
 * Responde os erros do SuperTokens lançados nas rotas da aplicação (ex.: sessão ausente ou
 * expirada, a partir da verificação de sessão da T6) no formato que os SDKs de front esperam,
 * com o status e os headers que disparam o refresh automático.
 *
 * Precisa ser registrado depois do `GlobalExceptionFilter`, para ter precedência sobre ele.
 * Um erro que o SDK não reconhece volta para o `GlobalExceptionFilter`.
 */
@Catch(SuperTokensError)
export class SuperTokensExceptionFilter implements ExceptionFilter {
  private readonly handler = errorHandler();
  private readonly fallback = new GlobalExceptionFilter();

  async catch(exception: Error, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    await this.handler(exception, http.getRequest<Request>(), response, (unhandled?: unknown) =>
      this.fallback.catch(unhandled ?? exception, host),
    );
  }
}
