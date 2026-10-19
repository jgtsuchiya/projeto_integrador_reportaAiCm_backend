import { FakeIdentityProvider } from '../../testing/in-memory-users';
import { IdentitySession } from '../ports/identity-provider';
import { ListSessionsUseCase } from './list-sessions.use-case';

describe('ListSessionsUseCase', () => {
  const USER_ID = 'user-1';
  let identityProvider: FakeIdentityProvider;
  let sut: ListSessionsUseCase;

  beforeEach(() => {
    identityProvider = new FakeIdentityProvider();
    sut = new ListSessionsUseCase(identityProvider);
  });

  function openSession(
    handle: string,
    createdAt: string,
    origin: Partial<IdentitySession> = {},
    userId = USER_ID,
  ): void {
    identityProvider.openSession(userId, {
      handle,
      createdAt: new Date(createdAt),
      expiresAt: new Date('2026-10-12T12:00:00.000Z'),
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
      ...origin,
    });
  }

  it('deve listar as sessões do usuário com a data do login, a validade e a origem (RN23)', async () => {
    openSession('celular', '2026-10-05T12:00:00.000Z');

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'celular' });

    expect(sessions).toEqual([
      {
        id: 'celular',
        createdAt: new Date('2026-10-05T12:00:00.000Z'),
        expiresAt: new Date('2026-10-12T12:00:00.000Z'),
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        current: true,
      },
    ]);
  });

  it('deve marcar como atual só a sessão da requisição', async () => {
    openSession('celular', '2026-10-05T12:00:00.000Z');
    openSession('notebook', '2026-10-05T13:00:00.000Z');

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'celular' });

    expect(sessions.map(({ id, current }) => [id, current])).toEqual([
      ['notebook', false],
      ['celular', true],
    ]);
  });

  it('deve ordenar da sessão mais recente para a mais antiga', async () => {
    openSession('antiga', '2026-10-03T12:00:00.000Z');
    openSession('recente', '2026-10-05T12:00:00.000Z');
    openSession('do-meio', '2026-10-04T12:00:00.000Z');

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'recente' });

    expect(sessions.map(({ id }) => id)).toEqual(['recente', 'do-meio', 'antiga']);
  });

  it('deve manter a mesma ordem entre as sessões abertas no mesmo instante', async () => {
    openSession('b', '2026-10-05T12:00:00.000Z');
    openSession('a', '2026-10-05T12:00:00.000Z');

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'a' });

    expect(sessions.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('deve listar sem IP e sem user agent a sessão aberta antes de a origem ser guardada', async () => {
    openSession('antiga', '2026-10-01T12:00:00.000Z', { ipAddress: null, userAgent: null });

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'antiga' });

    expect(sessions).toEqual([
      expect.objectContaining({ id: 'antiga', ipAddress: null, userAgent: null }),
    ]);
  });

  it('não deve listar as sessões de outro usuário', async () => {
    openSession('celular', '2026-10-05T12:00:00.000Z');
    openSession('de-outro-usuario', '2026-10-05T13:00:00.000Z', {}, 'user-2');

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'celular' });

    expect(sessions.map(({ id }) => id)).toEqual(['celular']);
  });

  it('não deve marcar nenhuma como atual quando a sessão da requisição já foi encerrada', async () => {
    openSession('celular', '2026-10-05T12:00:00.000Z');

    const sessions = await sut.execute({ userId: USER_ID, sessionHandle: 'encerrada' });

    expect(sessions.map(({ current }) => current)).toEqual([false]);
  });
});
