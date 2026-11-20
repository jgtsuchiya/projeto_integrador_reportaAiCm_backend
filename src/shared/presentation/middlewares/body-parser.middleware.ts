import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import express, { type RequestHandler } from 'express';

import { formatByteSize } from '@shared/domain/byte-size';

/** Limite padrão do corpo das requisições, o mesmo do body-parser. */
export const DEFAULT_BODY_LIMIT_BYTES = 100 * 1024;

export const INVALID_JSON_MESSAGE = 'O corpo da requisição não é um JSON válido.';
export const UNREADABLE_BODY_MESSAGE = 'Não foi possível ler o corpo da requisição.';

/** Erro dos parsers do body-parser (pacote `http-errors`): o `type` diz o motivo. */
interface BodyParserError {
  type: string;
  status: number;
}

/**
 * Parser de JSON com limite de tamanho. O `configureApp` registra um para as rotas de reportes,
 * que recebem a foto em base64, e outro, com o limite padrão, para as demais. A aplicação é
 * criada com `bodyParser: false`, para os parsers do Nest não lerem o corpo antes.
 */
export function createJsonBodyParser(limitBytes: number): RequestHandler {
  return withHttpErrors(express.json({ limit: limitBytes }), limitBytes);
}

/** Parser de formulário (`application/x-www-form-urlencoded`), que o Nest também registra. */
export function createUrlencodedBodyParser(limitBytes: number): RequestHandler {
  return withHttpErrors(express.urlencoded({ extended: true, limit: limitBytes }), limitBytes);
}

/**
 * Os erros do parser chegam ao `GlobalExceptionFilter` como erros quaisquer e virariam 500. Aqui
 * eles viram `HttpException`, que o filtro responde no corpo padrão: o corpo grande, 413, e o
 * JSON malformado, 400. As mensagens são fixas: a do `JSON.parse` traria um trecho do corpo, que
 * pode ser a foto (RN36).
 */
function withHttpErrors(parse: RequestHandler, limitBytes: number): RequestHandler {
  return (request, response, next) => {
    parse(request, response, (error?: unknown) => {
      next(error === undefined ? undefined : toHttpException(error, limitBytes));
    });
  };
}

export function toHttpException(error: unknown, limitBytes: number): unknown {
  if (!isBodyParserError(error)) {
    return error;
  }

  switch (error.type) {
    case 'entity.too.large':
      return new PayloadTooLargeException(
        `O corpo da requisição passa do limite de ${formatByteSize(limitBytes)}.`,
      );
    case 'entity.parse.failed':
      return new BadRequestException(INVALID_JSON_MESSAGE);
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new UnsupportedMediaTypeException(UNREADABLE_BODY_MESSAGE);
    default:
      return error.status >= 400 && error.status < 500
        ? new HttpException(UNREADABLE_BODY_MESSAGE, error.status)
        : error;
  }
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Partial<BodyParserError>).type === 'string' &&
    typeof (error as Partial<BodyParserError>).status === 'number'
  );
}
