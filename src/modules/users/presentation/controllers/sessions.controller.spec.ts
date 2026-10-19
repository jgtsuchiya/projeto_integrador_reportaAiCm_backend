import { Test } from '@nestjs/testing';

import type { SessionOutput } from '../../application/dtos/session.output';
import type { AuthenticatedUser } from '../../application/use-cases/get-authenticated-user.use-case';
import { ListSessionsUseCase } from '../../application/use-cases/list-sessions.use-case';
import { RevokeOtherSessionsUseCase } from '../../application/use-cases/revoke-other-sessions.use-case';
import { RevokeSessionUseCase } from '../../application/use-cases/revoke-session.use-case';
import { SessionsController } from './sessions.controller';

describe('SessionsController', () => {
  let sut: SessionsController;
  let listSessionsUseCase: jest.Mocked<ListSessionsUseCase>;
  let revokeSessionUseCase: jest.Mocked<RevokeSessionUseCase>;
  let revokeOtherSessionsUseCase: jest.Mocked<RevokeOtherSessionsUseCase>;

  const user: AuthenticatedUser = { id: 'client-1', role: 'CLIENT', sessionHandle: 'session-1' };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: ListSessionsUseCase, useValue: { execute: jest.fn() } },
        { provide: RevokeSessionUseCase, useValue: { execute: jest.fn() } },
        { provide: RevokeOtherSessionsUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    sut = moduleRef.get(SessionsController);
    listSessionsUseCase = moduleRef.get(ListSessionsUseCase);
    revokeSessionUseCase = moduleRef.get(RevokeSessionUseCase);
    revokeOtherSessionsUseCase = moduleRef.get(RevokeOtherSessionsUseCase);
  });

  it('deve listar as sessões do usuário da sessão, informando a da requisição', async () => {
    const sessions: SessionOutput[] = [
      {
        id: 'session-1',
        createdAt: new Date('2026-10-05T12:00:00.000Z'),
        expiresAt: new Date('2026-10-12T12:00:00.000Z'),
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        current: true,
      },
    ];
    listSessionsUseCase.execute.mockResolvedValue(sessions);

    await expect(sut.list(user)).resolves.toBe(sessions);
    expect(listSessionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'client-1',
      sessionHandle: 'session-1',
    });
  });

  it('deve encerrar as outras sessões mantendo a da requisição', async () => {
    revokeOtherSessionsUseCase.execute.mockResolvedValue();

    await sut.revokeOthers(user);

    expect(revokeOtherSessionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'client-1',
      sessionHandle: 'session-1',
    });
  });

  it('deve encerrar a sessão informada entre as do usuário da sessão', async () => {
    revokeSessionUseCase.execute.mockResolvedValue();

    await sut.revoke('session-2', user);

    expect(revokeSessionUseCase.execute).toHaveBeenCalledWith({
      userId: 'client-1',
      sessionId: 'session-2',
    });
  });
});
