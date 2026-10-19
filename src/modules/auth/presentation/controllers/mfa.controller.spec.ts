import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SessionContainer } from 'supertokens-node/recipe/session';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';
import { ResendLoginCodeUseCase } from '@modules/users/application/use-cases/resend-login-code.use-case';
import { VerifyLoginCodeUseCase } from '@modules/users/application/use-cases/verify-login-code.use-case';
import { InvalidLoginCodeError } from '@modules/users/domain/errors/invalid-login-code.error';

import { SessionSecondFactor } from '../../application/ports/session-second-factor';
import { MfaController, SECOND_FACTOR_NOT_PENDING_MESSAGE } from './mfa.controller';

describe('MfaController', () => {
  let sut: MfaController;
  let verifyLoginCodeUseCase: jest.Mocked<VerifyLoginCodeUseCase>;
  let resendLoginCodeUseCase: jest.Mocked<ResendLoginCodeUseCase>;
  let sessionSecondFactor: jest.Mocked<SessionSecondFactor<SessionContainer>>;

  const user: AuthenticatedUser = { id: 'client-1', role: 'CLIENT', sessionHandle: 'session-1' };
  const session = { getHandle: () => 'session-1' } as SessionContainer;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MfaController],
      providers: [
        { provide: VerifyLoginCodeUseCase, useValue: { execute: jest.fn() } },
        { provide: ResendLoginCodeUseCase, useValue: { execute: jest.fn() } },
        {
          provide: SessionSecondFactor,
          useValue: { isPending: jest.fn(), assertCompleted: jest.fn(), complete: jest.fn() },
        },
      ],
    }).compile();

    sut = moduleRef.get(MfaController);
    verifyLoginCodeUseCase = moduleRef.get(VerifyLoginCodeUseCase);
    resendLoginCodeUseCase = moduleRef.get(ResendLoginCodeUseCase);
    sessionSecondFactor = moduleRef.get(SessionSecondFactor);
    sessionSecondFactor.isPending.mockResolvedValue(true);
  });

  describe('verify', () => {
    it('deve conferir o código do usuário da sessão e só depois completar a sessão (RN25)', async () => {
      const order: string[] = [];
      verifyLoginCodeUseCase.execute.mockImplementation(async () => {
        order.push('código');
      });
      sessionSecondFactor.complete.mockImplementation(async () => {
        order.push('sessão');
      });

      await sut.verify({ code: '042137' }, user, session);

      expect(order).toEqual(['código', 'sessão']);
      expect(sessionSecondFactor.isPending).toHaveBeenCalledWith(session);
      expect(verifyLoginCodeUseCase.execute).toHaveBeenCalledWith({
        userId: 'client-1',
        code: '042137',
      });
      expect(sessionSecondFactor.complete).toHaveBeenCalledWith(session);
    });

    it('não deve completar a sessão quando o código é recusado', async () => {
      verifyLoginCodeUseCase.execute.mockRejectedValue(new InvalidLoginCodeError());

      await expect(sut.verify({ code: '000000' }, user, session)).rejects.toThrow(
        InvalidLoginCodeError,
      );

      expect(sessionSecondFactor.complete).not.toHaveBeenCalled();
    });

    it('deve responder 422 à sessão que não está pendente, sem conferir o código', async () => {
      sessionSecondFactor.isPending.mockResolvedValue(false);

      await expect(sut.verify({ code: '042137' }, user, session)).rejects.toThrow(
        new UnprocessableEntityException(SECOND_FACTOR_NOT_PENDING_MESSAGE),
      );

      expect(verifyLoginCodeUseCase.execute).not.toHaveBeenCalled();
      expect(sessionSecondFactor.complete).not.toHaveBeenCalled();
    });
  });

  describe('resendCode', () => {
    it('deve reenviar o código para o usuário da sessão pendente', async () => {
      resendLoginCodeUseCase.execute.mockResolvedValue();

      await sut.resendCode(user, session);

      expect(sessionSecondFactor.isPending).toHaveBeenCalledWith(session);
      expect(resendLoginCodeUseCase.execute).toHaveBeenCalledWith({ userId: 'client-1' });
      expect(sessionSecondFactor.complete).not.toHaveBeenCalled();
    });

    it('deve responder 422 à sessão que não está pendente, sem enviar o código', async () => {
      sessionSecondFactor.isPending.mockResolvedValue(false);

      await expect(sut.resendCode(user, session)).rejects.toThrow(
        new UnprocessableEntityException(SECOND_FACTOR_NOT_PENDING_MESSAGE),
      );

      expect(resendLoginCodeUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
