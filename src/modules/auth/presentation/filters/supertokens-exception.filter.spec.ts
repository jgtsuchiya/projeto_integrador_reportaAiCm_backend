import { ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Error as SuperTokensError } from 'supertokens-node';

import { INTERNAL_ERROR_MESSAGE } from '@shared/presentation/filters/global-exception.filter';

import { SuperTokensExceptionFilter } from './supertokens-exception.filter';

const mockSdkErrorHandler = jest.fn();

jest.mock('supertokens-node/framework/express', () => ({
  errorHandler: () => mockSdkErrorHandler,
}));

interface FakeResponse {
  headersSent: boolean;
  status: jest.Mock;
  json: jest.Mock;
}

function createHost(request: object, response: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('SuperTokensExceptionFilter', () => {
  const exception = new SuperTokensError({
    type: 'UNAUTHORISED',
    message: 'Sessão não encontrada.',
  });
  const request = {};
  let sut: SuperTokensExceptionFilter;
  let response: FakeResponse;

  beforeEach(() => {
    sut = new SuperTokensExceptionFilter();
    response = { headersSent: false, status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  it('deve delegar o erro ao tratamento do SDK do SuperTokens', async () => {
    mockSdkErrorHandler.mockResolvedValue(undefined);

    await sut.catch(exception, createHost(request, response));

    expect(mockSdkErrorHandler).toHaveBeenCalledWith(
      exception,
      request,
      response,
      expect.any(Function),
    );
  });

  it('deve responder no formato padrão quando o SDK não trata o erro', async () => {
    mockSdkErrorHandler.mockImplementation(
      (err: unknown, _req: unknown, _res: unknown, next: (err?: unknown) => void) => next(err),
    );

    await sut.catch(exception, createHost(request, response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it('não deve responder quando a resposta já foi enviada', async () => {
    response.headersSent = true;

    await sut.catch(exception, createHost(request, response));

    expect(mockSdkErrorHandler).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});
