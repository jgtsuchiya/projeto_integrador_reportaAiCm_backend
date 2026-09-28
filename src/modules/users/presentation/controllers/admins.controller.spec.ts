import { Test } from '@nestjs/testing';

import type { AdminOutput } from '../../application/dtos/admin.output';
import { ChangeAdminStatusUseCase } from '../../application/use-cases/change-admin-status.use-case';
import { DeleteAdminUseCase } from '../../application/use-cases/delete-admin.use-case';
import { GetAdminUseCase } from '../../application/use-cases/get-admin.use-case';
import {
  InviteAdminOutput,
  InviteAdminUseCase,
} from '../../application/use-cases/invite-admin.use-case';
import { ListAdminsUseCase } from '../../application/use-cases/list-admins.use-case';
import { ResendAdminInvitationUseCase } from '../../application/use-cases/resend-admin-invitation.use-case';
import { UpdateAdminUseCase } from '../../application/use-cases/update-admin.use-case';
import { AdminsController } from './admins.controller';

describe('AdminsController', () => {
  let sut: AdminsController;
  let inviteAdminUseCase: jest.Mocked<InviteAdminUseCase>;
  let resendAdminInvitationUseCase: jest.Mocked<ResendAdminInvitationUseCase>;
  let listAdminsUseCase: jest.Mocked<ListAdminsUseCase>;
  let getAdminUseCase: jest.Mocked<GetAdminUseCase>;
  let updateAdminUseCase: jest.Mocked<UpdateAdminUseCase>;
  let changeAdminStatusUseCase: jest.Mocked<ChangeAdminStatusUseCase>;
  let deleteAdminUseCase: jest.Mocked<DeleteAdminUseCase>;

  const admin: AdminOutput = {
    id: 'admin-1',
    role: 'ADMIN',
    name: 'Ana Souza',
    email: 'ana@example.com',
    status: 'ACTIVE',
    emailVerifiedAt: new Date('2026-09-28T13:00:00.000Z'),
    lastLoginAt: null,
    createdById: 'super-admin-1',
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
    updatedAt: new Date('2026-09-28T13:00:00.000Z'),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminsController],
      providers: [
        { provide: InviteAdminUseCase, useValue: { execute: jest.fn() } },
        { provide: ResendAdminInvitationUseCase, useValue: { execute: jest.fn() } },
        { provide: ListAdminsUseCase, useValue: { execute: jest.fn() } },
        { provide: GetAdminUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateAdminUseCase, useValue: { execute: jest.fn() } },
        { provide: ChangeAdminStatusUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteAdminUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    sut = moduleRef.get(AdminsController);
    inviteAdminUseCase = moduleRef.get(InviteAdminUseCase);
    resendAdminInvitationUseCase = moduleRef.get(ResendAdminInvitationUseCase);
    listAdminsUseCase = moduleRef.get(ListAdminsUseCase);
    getAdminUseCase = moduleRef.get(GetAdminUseCase);
    updateAdminUseCase = moduleRef.get(UpdateAdminUseCase);
    changeAdminStatusUseCase = moduleRef.get(ChangeAdminStatusUseCase);
    deleteAdminUseCase = moduleRef.get(DeleteAdminUseCase);
  });

  it('deve convidar o ADMIN em nome do SuperAdm da sessão', async () => {
    const output: InviteAdminOutput = {
      id: 'admin-1',
      role: 'ADMIN',
      name: 'Ana Souza',
      email: 'ana@example.com',
      status: 'PENDING',
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdById: 'super-admin-1',
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
      updatedAt: new Date('2026-09-28T12:00:00.000Z'),
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

  it('deve delegar a listagem com a paginação e o filtro', async () => {
    const page = { items: [admin], page: 1, pageSize: 20, total: 1 };
    listAdminsUseCase.execute.mockResolvedValue(page);

    const result = await sut.list({ page: 1, pageSize: 20, status: 'ACTIVE' });

    expect(listAdminsUseCase.execute).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'ACTIVE',
    });
    expect(result).toBe(page);
  });

  it('deve delegar o detalhe para o caso de uso', async () => {
    getAdminUseCase.execute.mockResolvedValue(admin);

    await expect(sut.findOne('admin-1')).resolves.toBe(admin);
    expect(getAdminUseCase.execute).toHaveBeenCalledWith({ adminId: 'admin-1' });
  });

  it('deve delegar a edição do nome para o caso de uso', async () => {
    updateAdminUseCase.execute.mockResolvedValue(admin);

    await expect(sut.update('admin-1', { name: 'Ana Souza' })).resolves.toBe(admin);
    expect(updateAdminUseCase.execute).toHaveBeenCalledWith({
      adminId: 'admin-1',
      name: 'Ana Souza',
    });
  });

  it('deve delegar a mudança de status para o caso de uso', async () => {
    changeAdminStatusUseCase.execute.mockResolvedValue({ ...admin, status: 'INACTIVE' });

    const result = await sut.changeStatus('admin-1', { status: 'INACTIVE' });

    expect(changeAdminStatusUseCase.execute).toHaveBeenCalledWith({
      adminId: 'admin-1',
      status: 'INACTIVE',
    });
    expect(result.status).toBe('INACTIVE');
  });

  it('deve delegar a exclusão para o caso de uso', async () => {
    deleteAdminUseCase.execute.mockResolvedValue();

    await sut.remove('admin-1');

    expect(deleteAdminUseCase.execute).toHaveBeenCalledWith({ adminId: 'admin-1' });
  });
});
