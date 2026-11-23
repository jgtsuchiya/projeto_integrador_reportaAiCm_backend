import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';
import { ConflictError } from '@shared/domain/errors/conflict.error';
import { DomainError } from '@shared/domain/errors/domain.error';
import { ForbiddenError } from '@shared/domain/errors/forbidden.error';
import { NotFoundError } from '@shared/domain/errors/not-found.error';

import { GlobalExceptionFilter, INTERNAL_ERROR_MESSAGE } from './global-exception.filter';

class UncategorizedError extends DomainError {
  constructor() {
    super('Erro de domínio sem categoria.');
  }
}

interface FakeResponse {
  headersSent: boolean;
  status: jest.Mock;
  json: jest.Mock;
}

function createHost(response: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  let sut: GlobalExceptionFilter;
  let response: FakeResponse;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    sut = new GlobalExceptionFilter();
    response = { headersSent: false, status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  it.each([
    [new NotFoundError('Usuário não encontrado.'), HttpStatus.NOT_FOUND, 'Not Found'],
    [new ConflictError('E-mail já cadastrado.'), HttpStatus.CONFLICT, 'Conflict'],
    [
      new BusinessRuleError('Transição de status inválida.'),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Unprocessable Entity',
    ],
    [new ForbiddenError('Operação não permitida.'), HttpStatus.FORBIDDEN, 'Forbidden'],
  ])('deve converter %p no status %p', (exception, statusCode, error) => {
    sut.catch(exception, createHost(response));

    expect(response.status).toHaveBeenCalledWith(statusCode);
    expect(response.json).toHaveBeenCalledWith({ statusCode, error, message: exception.message });
  });

  it('deve incluir os detalhes do erro de domínio', () => {
    const exception = new ConflictError('E-mail já cadastrado.', { field: 'email' });

    sut.catch(exception, createHost(response));

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: { field: 'email' } }),
    );
  });

  it('deve manter o status, a mensagem e os detalhes do erro de validação', () => {
    const details = [{ field: 'email', message: 'E-mail inválido.' }];
    const exception = new BadRequestException({ message: 'Dados inválidos.', details });

    sut.catch(exception, createHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Dados inválidos.',
      details,
    });
  });

  it('deve padronizar as exceções HTTP do Nest', () => {
    sut.catch(new NotFoundException('Cannot GET /api/nada'), createHost(response));

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /api/nada',
    });
  });

  it('deve mover uma lista de mensagens para os detalhes', () => {
    const exception = new BadRequestException(['name should not be empty']);

    sut.catch(exception, createHost(response));

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Bad Request',
      details: ['name should not be empty'],
    });
  });

  it('deve retornar 500 sem vazar a mensagem nem o stack de um erro não mapeado', () => {
    const exception = new Error('connect ECONNREFUSED 127.0.0.1:3306');

    sut.catch(exception, createHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: INTERNAL_ERROR_MESSAGE,
    });
    expect(loggerError).toHaveBeenCalledWith(exception.message, exception.stack);
  });

  it('deve retornar 500 quando o valor lançado não é um Error', () => {
    sut.catch('falha', createHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(loggerError).toHaveBeenCalledWith('falha', undefined);
  });

  it('deve retornar 500 para um erro de domínio sem categoria', () => {
    sut.catch(new UncategorizedError(), createHost(response));

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: INTERNAL_ERROR_MESSAGE }),
    );
  });

  it('deve registrar no log as exceções HTTP 5xx', () => {
    sut.catch(new InternalServerErrorException(), createHost(response));

    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('não deve registrar no log os erros 4xx', () => {
    sut.catch(new NotFoundError('Usuário não encontrado.'), createHost(response));

    expect(loggerError).not.toHaveBeenCalled();
  });

  it('não deve responder quando a resposta já foi enviada', () => {
    response.headersSent = true;

    sut.catch(new Error('falha depois da resposta'), createHost(response));

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledTimes(1);
  });
});
