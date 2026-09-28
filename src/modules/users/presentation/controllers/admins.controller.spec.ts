import { Test } from '@nestjs/testing';

import {
  InviteAdminOutput,
  InviteAdminUseCase,
} from '../../application/use-cases/invite-admin.use-case';
import { ResendAdminInvitationUseCase } from '../../application/use-cases/resend-admin-invitation.use-case';
import { AdminsController } from './admins.controller';

describe('AdminsController', () => {
  let sut: AdminsController;
  let inviteAdminUseCase: jest.Mocked<InviteAdminUseCase>;
  let resendAdminInvitationUseCase: jest.Mocked<ResendAdminInvitationUseCase>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminsController],
      providers: [
        { provide: InviteAdminUseCase, useValue: { execute: jest.fn() } },
        { provide: ResendAdminInvitationUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    sut = moduleRef.get(AdminsController);
    inviteAdminUseCase = moduleRef.get(InviteAdminUseCase);
    resendAdminInvitationUseCase = moduleRef.get(ResendAdminInvitationUseCase);
  });

  it('deve convidar o ADMIN em nome do SuperAdm da sessão', async () => {
    const output: InviteAdminOutput = {
      id: 'admin-1',
      role: 'ADMIN',
      name: 'Ana Souza',
      email: 'ana@example.com',
      status: 'PENDING',
      createdById: 'super-admin-1',
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
      invitation: { sent: true, expiresAt: new Date('2026-09-30T12:00:00.000Z') },
    };
    inviteAdminUseCase.execute.mockResolvedValue(output);

    const result = await sut.invite(
      { name: 'Ana Souza', email: 'ana@example.com' },
      { id: 'super-admin-1', role: 'SUPER_ADMIN' },
    );

    expect(inviteAdminUseCase.execute).toHaveBeenCalledWith({
      name: 'Ana Souza',
      email: 'ana@example.com',
      invitedById: 'super-admin-1',
    });
    expect(result).toBe(output);
  });

  it('deve delegar o reenvio do convite para o caso de uso', async () => {
    const output = { sent: true, expiresAt: new Date('2026-09-30T12:00:00.000Z') };
    resendAdminInvitationUseCase.execute.mockResolvedValue(output);

    const result = await sut.resendInvitation('admin-1');

    expect(resendAdminInvitationUseCase.execute).toHaveBeenCalledWith({ adminId: 'admin-1' });
    expect(result).toBe(output);
  });
});
