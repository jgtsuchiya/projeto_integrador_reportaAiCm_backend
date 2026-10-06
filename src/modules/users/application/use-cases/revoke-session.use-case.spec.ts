import { SessionNotFoundError } from '../../domain/errors/session-not-found.error';
import { FakeIdentityProvider } from '../../testing/in-memory-users';
import { RevokeSessionUseCase } from './revoke-session.use-case';

describe('RevokeSessionUseCase', () => {
  const USER_ID = 'user-1';
  let identityProvider: FakeIdentityProvider;
  let sut: RevokeSessionUseCase;

  beforeEach(() => {
    identityProvider = new FakeIdentityProvider();
    sut = new RevokeSessionUseCase(identityProvider);
    identityProvider.sessions.set(USER_ID, ['atual', 'celular', 'notebook']);
    identityProvider.sessions.set('user-2', ['de-outro-usuario']);
  });

  it('deve encerrar só a sessão informada (RN23)', async () => {
    await sut.execute({ userId: USER_ID, sessionId: 'celular' });

    expect(identityProvider.sessions.get(USER_ID)).toEqual(['atual', 'notebook']);
    expect(identityProvider.sessions.get('user-2')).toEqual(['de-outro-usuario']);
  });

  it('deve encerrar a sessão da própria requisição', async () => {
    await sut.execute({ userId: USER_ID, sessionId: 'atual' });

    expect(identityProvider.sessions.get(USER_ID)).toEqual(['celular', 'notebook']);
  });

  it.each([
    ['de outro usuário', 'de-outro-usuario'],
    ['que não existe', 'inexistente'],
  ])('deve lançar SessionNotFoundError para a sessão %s, sem encerrar nada', async (_case, id) => {
    const revokeSession = jest.spyOn(identityProvider, 'revokeSession');

    await expect(sut.execute({ userId: USER_ID, sessionId: id })).rejects.toThrow(
      SessionNotFoundError,
    );

    expect(revokeSession).not.toHaveBeenCalled();
    expect(identityProvider.sessions.get(USER_ID)).toHaveLength(3);
    expect(identityProvider.sessions.get('user-2')).toEqual(['de-outro-usuario']);
  });

  it('deve lançar SessionNotFoundError para uma sessão já encerrada', async () => {
    await sut.execute({ userId: USER_ID, sessionId: 'celular' });

    await expect(sut.execute({ userId: USER_ID, sessionId: 'celular' })).rejects.toThrow(
      SessionNotFoundError,
    );
  });
});
