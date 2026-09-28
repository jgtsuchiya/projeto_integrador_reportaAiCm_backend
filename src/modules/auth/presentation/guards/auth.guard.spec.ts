import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Session from 'supertokens-node/recipe/session';

import {
  AuthenticatedUser,
  GetAuthenticatedUserUseCase,
} from '@modules/users/application/use-cases/get-authenticated-user.use-case';

import type { AuthenticatedRequest } from '../authenticated-request';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { AuthGuard, FORBIDDEN_ROLE_MESSAGE, INVALID_SESSION_MESSAGE } from './auth.guard';

jest.mock('supertokens-node/recipe/session', () => ({
  __esModule: true,
  default: { getSession: jest.fn() },
}));

const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';

@Controller('probe')
class ProbeController {
  @Get()
  authenticated(): void {}

  @Public()
  @Get('public')
  open(): void {}

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('panel')
  panel(): void {}
}

@Public()
@Controller('public-probe')
class PublicController {
  @Get()
  open(): void {}
}

@Roles('SUPER_ADMIN')
@Controller('admin-probe')
class AdminController {
  @Get()
  list(): void {}

  @Roles('CLIENT')
  @Get('me')
  me(): void {}
}

function createContext(
  controller: object,
  handler: string,
  request: AuthenticatedRequest,
): ExecutionContext {
  const response = {};

  return {
    getClass: () => controller.constructor,
    getHandler: () => (controller as Record<string, () => void>)[handler],
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const probe = new ProbeController();
  let request: AuthenticatedRequest;
  let session: { getUserId: jest.Mock; revokeSession: jest.Mock };
  let getAuthenticatedUser: jest.Mocked<Pick<GetAuthenticatedUserUseCase, 'execute'>>;
  let sut: AuthGuard;

  beforeEach(() => {
    request = {} as AuthenticatedRequest;
    session = { getUserId: jest.fn().mockReturnValue(USER_ID), revokeSession: jest.fn() };
    jest
      .mocked(Session.getSession)
      .mockResolvedValue(session as unknown as Awaited<ReturnType<typeof Session.getSession>>);
    getAuthenticatedUser = { execute: jest.fn() };
    sut = new AuthGuard(
      new Reflector(),
      getAuthenticatedUser as unknown as GetAuthenticatedUserUseCase,
    );
  });

  function authenticateAs(role: AuthenticatedUser['role']): AuthenticatedUser {
    const user = { id: USER_ID, role };
    getAuthenticatedUser.execute.mockResolvedValue(user);

    return user;
  }

  it.each([
    ['o método', probe, 'open'],
    ['o controller', new PublicController(), 'open'],
  ])('deve liberar sem sessão quando %s é @Public()', async (_target, controller, handler) => {
    await expect(sut.canActivate(createContext(controller, handler, request))).resolves.toBe(true);
    expect(Session.getSession).not.toHaveBeenCalled();
  });

  it('deve propagar o erro do SuperTokens quando não há sessão', async () => {
    const failure = new Error('UNAUTHORISED');
    jest.mocked(Session.getSession).mockRejectedValue(failure);

    await expect(sut.canActivate(createContext(probe, 'authenticated', request))).rejects.toBe(
      failure,
    );
    expect(getAuthenticatedUser.execute).not.toHaveBeenCalled();
  });

  it('deve carregar o usuário da sessão no MySQL e anexá-lo à requisição', async () => {
    const user = authenticateAs('CLIENT');

    await expect(sut.canActivate(createContext(probe, 'authenticated', request))).resolves.toBe(
      true,
    );
    expect(getAuthenticatedUser.execute).toHaveBeenCalledWith({ userId: USER_ID });
    expect(request.user).toEqual(user);
  });

  it('deve revogar a sessão e responder 401 quando o usuário perdeu o acesso', async () => {
    getAuthenticatedUser.execute.mockResolvedValue(null);

    await expect(sut.canActivate(createContext(probe, 'authenticated', request))).rejects.toThrow(
      new UnauthorizedException(INVALID_SESSION_MESSAGE),
    );
    expect(session.revokeSession).toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('deve liberar quando o papel está entre os do @Roles()', async () => {
    authenticateAs('ADMIN');

    await expect(sut.canActivate(createContext(probe, 'panel', request))).resolves.toBe(true);
  });

  it('deve responder 403 quando o papel não está entre os do @Roles()', async () => {
    authenticateAs('CLIENT');

    await expect(sut.canActivate(createContext(probe, 'panel', request))).rejects.toThrow(
      new ForbiddenException(FORBIDDEN_ROLE_MESSAGE),
    );
  });

  it('deve aplicar o @Roles() do controller a todos os métodos', async () => {
    authenticateAs('ADMIN');

    await expect(
      sut.canActivate(createContext(new AdminController(), 'list', request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('deve priorizar o @Roles() do método sobre o do controller', async () => {
    authenticateAs('CLIENT');

    await expect(
      sut.canActivate(createContext(new AdminController(), 'me', request)),
    ).resolves.toBe(true);
  });
});
