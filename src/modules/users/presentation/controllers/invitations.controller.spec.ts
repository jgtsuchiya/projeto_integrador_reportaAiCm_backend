import { Test } from '@nestjs/testing';

import { AcceptInvitationUseCase } from '../../application/use-cases/accept-invitation.use-case';
import { InvitationsController } from './invitations.controller';

describe('InvitationsController', () => {
  let sut: InvitationsController;
  let acceptInvitationUseCase: jest.Mocked<AcceptInvitationUseCase>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: AcceptInvitationUseCase, useValue: { execute: jest.fn() } }],
    }).compile();

    sut = moduleRef.get(InvitationsController);
    acceptInvitationUseCase = moduleRef.get(AcceptInvitationUseCase);
  });

  it('deve delegar o aceite do convite para o caso de uso', async () => {
    acceptInvitationUseCase.execute.mockResolvedValue();
    const body = { token: 'segredo', password: 'senha-forte-1' };

    await sut.accept(body);

    expect(acceptInvitationUseCase.execute).toHaveBeenCalledWith(body);
  });
});
