import { FakeIdentityProvider } from '../../testing/in-memory-users';
import { RevokeOtherSessionsUseCase } from './revoke-other-sessions.use-case';

describe('RevokeOtherSessionsUseCase', () => {
  const USER_ID = 'user-1';
  let identityProvider: FakeIdentityProvider;
  let sut: RevokeOtherSessionsUseCase;

  beforeEach(() => {
    identityProvider = new FakeIdentityProvider();
    sut = new RevokeOtherSessionsUseCase(identityProvider);
  });

  it('deve encerrar todas as sessões do usuário, menos a da requisição (RN23)', async () => {
    identityProvider.sessions.set(USER_ID, ['atual', 'celular', 'notebook']);

    await sut.execute({ userId: USER_ID, sessionHandle: 'atual' });

    expect(identityProvider.sessions.get(USER_ID)).toEqual(['atual']);
  });

  it('não deve encerrar as sessões de outro usuário', async () => {
    identityProvider.sessions.set(USER_ID, ['atual', 'celular']);
    identityProvider.sessions.set('user-2', ['de-outro-usuario']);

    await sut.execute({ userId: USER_ID, sessionHandle: 'atual' });

    expect(identityProvider.sessions.get('user-2')).toEqual(['de-outro-usuario']);
  });

  it('deve manter a sessão da requisição quando ela é a única', async () => {
    identityProvider.sessions.set(USER_ID, ['atual']);

    await sut.execute({ userId: USER_ID, sessionHandle: 'atual' });

    expect(identityProvider.sessions.get(USER_ID)).toEqual(['atual']);
  });
});
