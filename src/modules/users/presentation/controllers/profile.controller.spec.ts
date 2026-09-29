import { Test } from '@nestjs/testing';

import type { ProfileOutput } from '../../application/dtos/profile.output';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import { DeleteOwnAccountUseCase } from '../../application/use-cases/delete-own-account.use-case';
import type { AuthenticatedUser } from '../../application/use-cases/get-authenticated-user.use-case';
import { GetProfileUseCase } from '../../application/use-cases/get-profile.use-case';
import { UpdateProfileUseCase } from '../../application/use-cases/update-profile.use-case';
import { ProfileController } from './profile.controller';

describe('ProfileController', () => {
  let sut: ProfileController;
  let getProfileUseCase: jest.Mocked<GetProfileUseCase>;
  let updateProfileUseCase: jest.Mocked<UpdateProfileUseCase>;
  let changePasswordUseCase: jest.Mocked<ChangePasswordUseCase>;
  let deleteOwnAccountUseCase: jest.Mocked<DeleteOwnAccountUseCase>;

  const user: AuthenticatedUser = { id: 'client-1', role: 'CLIENT', sessionHandle: 'session-1' };
  const profile: ProfileOutput = {
    id: 'client-1',
    role: 'CLIENT',
    name: 'Maria da Silva',
    email: 'maria@example.com',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    lastLoginAt: new Date('2026-09-28T13:00:00.000Z'),
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
    updatedAt: new Date('2026-09-28T12:00:00.000Z'),
    cpf: '52998224725',
    phone: '43999998888',
    birthDate: '1990-05-20',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: GetProfileUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateProfileUseCase, useValue: { execute: jest.fn() } },
        { provide: ChangePasswordUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteOwnAccountUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    sut = moduleRef.get(ProfileController);
    getProfileUseCase = moduleRef.get(GetProfileUseCase);
    updateProfileUseCase = moduleRef.get(UpdateProfileUseCase);
    changePasswordUseCase = moduleRef.get(ChangePasswordUseCase);
    deleteOwnAccountUseCase = moduleRef.get(DeleteOwnAccountUseCase);
  });

  it('deve buscar o perfil do usuário da sessão', async () => {
    getProfileUseCase.execute.mockResolvedValue(profile);

    await expect(sut.findMe(user)).resolves.toBe(profile);
    expect(getProfileUseCase.execute).toHaveBeenCalledWith({ userId: 'client-1' });
  });

  it('deve editar o perfil do usuário da sessão', async () => {
    updateProfileUseCase.execute.mockResolvedValue(profile);

    await expect(sut.update({ phone: '43999998888' }, user)).resolves.toBe(profile);
    expect(updateProfileUseCase.execute).toHaveBeenCalledWith({
      userId: 'client-1',
      phone: '43999998888',
    });
  });

  it('deve trocar a senha mantendo a sessão da requisição', async () => {
    changePasswordUseCase.execute.mockResolvedValue();

    await sut.changePassword({ currentPassword: 'antiga-1', newPassword: 'nova-senha-2' }, user);

    expect(changePasswordUseCase.execute).toHaveBeenCalledWith({
      userId: 'client-1',
      sessionHandle: 'session-1',
      currentPassword: 'antiga-1',
      newPassword: 'nova-senha-2',
    });
  });

  it('deve excluir a conta do usuário da sessão', async () => {
    deleteOwnAccountUseCase.execute.mockResolvedValue();

    await sut.remove({ password: 'senha-forte-1' }, user);

    expect(deleteOwnAccountUseCase.execute).toHaveBeenCalledWith({
      userId: 'client-1',
      password: 'senha-forte-1',
    });
  });
});
