import { Test } from '@nestjs/testing';

import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case';
import { EmailVerificationsController } from './email-verifications.controller';

describe('EmailVerificationsController', () => {
  let sut: EmailVerificationsController;
  let verifyEmailUseCase: jest.Mocked<VerifyEmailUseCase>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EmailVerificationsController],
      providers: [{ provide: VerifyEmailUseCase, useValue: { execute: jest.fn() } }],
    }).compile();

    sut = moduleRef.get(EmailVerificationsController);
    verifyEmailUseCase = moduleRef.get(VerifyEmailUseCase);
  });

  it('deve delegar a confirmação do e-mail para o caso de uso', async () => {
    verifyEmailUseCase.execute.mockResolvedValue();
    const body = { token: 'segredo' };

    await sut.confirm(body);

    expect(verifyEmailUseCase.execute).toHaveBeenCalledWith(body);
  });
});
