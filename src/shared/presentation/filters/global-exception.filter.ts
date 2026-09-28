import { STATUS_CODES } from 'node:http';

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';
import { ConflictError } from '@shared/domain/errors/conflict.error';
import { DomainError } from '@shared/domain/errors/domain.error';
import { ForbiddenError } from '@shared/domain/errors/forbidden.error';
import { NotFoundError } from '@shared/domain/errors/not-found.error';

export const INTERNAL_ERROR_MESSAGE = 'Erro interno do servidor.';

/** Corpo de erro padrão de todas as rotas da aplicação. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

const DOMAIN_ERROR_STATUS: ReadonlyArray<[new (...args: never[]) => DomainError, HttpStatus]> = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [BusinessRuleError, HttpStatus.UNPROCESSABLE_ENTITY],
  [ForbiddenError, HttpStatus.FORBIDDEN],
];

/**
 * Converte qualquer exceção lançada nas rotas no corpo padrão `ErrorResponseBody`:
 *
 * - erros de domínio viram 404, 409, 422 ou 403, conforme a categoria;
 * - `HttpException` (inclusive a do `ZodValidationPipe`) mantém o status e a mensagem;
 * - qualquer outro erro vira 500 com mensagem genérica. O stack vai só para o log.
 *
 * O Nest consulta os filtros globais na ordem inversa de registro. Filtros mais
 * específicos, como o dos erros do SuperTokens, devem ser registrados depois deste
 * para terem precedência.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toResponseBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Outro handler (ex.: um middleware) já respondeu: não há mais o que enviar.
    if (response.headersSent) {
      return;
    }

    response.status(body.statusCode).json(body);
  }

  private toResponseBody(exception: unknown): ErrorResponseBody {
    if (exception instanceof DomainError) {
      const status = DOMAIN_ERROR_STATUS.find(([type]) => exception instanceof type)?.[1];
      if (status) {
        return buildBody(status, exception.message, exception.details);
      }
    }

    if (exception instanceof HttpException) {
      return fromHttpException(exception);
    }

    return buildBody(HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_ERROR_MESSAGE);
  }
}

function fromHttpException(exception: HttpException): ErrorResponseBody {
  const status = exception.getStatus();
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return buildBody(status, response);
  }

  const { message, details } = response as { message?: unknown; details?: unknown };
  if (typeof message === 'string') {
    return buildBody(status, message, details);
  }

  // Formato do ValidationPipe do Nest (`message: string[]`): as mensagens vão para `details`.
  return buildBody(status, reasonPhrase(status), details ?? message);
}

function buildBody(statusCode: number, message: string, details?: unknown): ErrorResponseBody {
  return {
    statusCode,
    error: reasonPhrase(statusCode),
    message,
    ...(details === undefined ? {} : { details }),
  };
}

function reasonPhrase(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Error';
}
