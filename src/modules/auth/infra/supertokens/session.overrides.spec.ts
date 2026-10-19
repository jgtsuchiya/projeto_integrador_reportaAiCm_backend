import supertokens from 'supertokens-node';
import type { RecipeInterface } from 'supertokens-node/recipe/session/types';

import { setSecondFactorRequired } from './second-factor.claim';
import { overrideSessionFunctions } from './session.overrides';

jest.mock('supertokens-node', () => ({
  __esModule: true,
  default: { getRequestFromUserContext: jest.fn() },
}));

type CreateNewSessionInput = Parameters<RecipeInterface['createNewSession']>[0];
type SessionContainer = Awaited<ReturnType<RecipeInterface['createNewSession']>>;
type SuperTokensRequest = ReturnType<typeof supertokens.getRequestFromUserContext>;

describe('overrideSessionFunctions', () => {
  const session = { getHandle: () => 'session-1' } as SessionContainer;
  const userContext = { _default: {} } as unknown as CreateNewSessionInput['userContext'];
  let original: jest.Mocked<Pick<RecipeInterface, 'createNewSession' | 'revokeSession'>>;
  let sut: RecipeInterface;

  beforeEach(() => {
    original = {
      createNewSession: jest.fn<Promise<SessionContainer>, [CreateNewSessionInput]>(),
      revokeSession: jest.fn(),
    };
    original.createNewSession.mockResolvedValue(session);
    sut = overrideSessionFunctions(original as unknown as RecipeInterface);
  });

  /** Requisição do SuperTokens, com a do Express em `original`. */
  function mockRequest(request: { ip?: string; userAgent?: string } | undefined): void {
    jest.mocked(supertokens.getRequestFromUserContext).mockReturnValue(
      request &&
        ({
          original: { ip: request.ip },
          getHeaderValue: (key: string) => (key === 'user-agent' ? request.userAgent : undefined),
        } as SuperTokensRequest),
    );
  }

  function buildInput(
    sessionDataInDatabase?: unknown,
    context: CreateNewSessionInput['userContext'] = userContext,
  ): CreateNewSessionInput {
    return {
      userId: 'user-1',
      tenantId: 'public',
      accessTokenPayload: { claim: 'valor' },
      sessionDataInDatabase,
      userContext: context,
    } as CreateNewSessionInput;
  }

  /** Contexto de uma requisição de login, com a decisão que o override do `signIn` deixou. */
  function signInContext(secondFactorRequired: boolean): CreateNewSessionInput['userContext'] {
    const context = { _default: {} } as unknown as CreateNewSessionInput['userContext'];
    setSecondFactorRequired(context, secondFactorRequired);

    return context;
  }

  it('deve manter as demais funções da receita', () => {
    expect(sut.revokeSession).toBe(original.revokeSession);
  });

  it('deve guardar o IP e o user agent da requisição nos dados da sessão (RN23)', async () => {
    mockRequest({ ip: '203.0.113.10', userAgent: 'Mozilla/5.0 (Linux; Android 16)' });
    const input = buildInput();

    const result = await sut.createNewSession(input);

    expect(result).toBe(session);
    expect(supertokens.getRequestFromUserContext).toHaveBeenCalledWith(userContext);
    expect(original.createNewSession).toHaveBeenCalledWith({
      ...input,
      sessionDataInDatabase: {
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Linux; Android 16)',
      },
    });
  });

  it('deve manter os dados que a sessão já levava', async () => {
    mockRequest({ ip: '203.0.113.10', userAgent: 'Mozilla/5.0' });

    await sut.createNewSession(buildInput({ outro: 'dado' }));

    expect(original.createNewSession.mock.calls[0][0].sessionDataInDatabase).toEqual({
      outro: 'dado',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('não deve colocar a origem do login no access token', async () => {
    mockRequest({ ip: '203.0.113.10', userAgent: 'Mozilla/5.0' });

    await sut.createNewSession(buildInput());

    expect(original.createNewSession.mock.calls[0][0].accessTokenPayload).toEqual({
      claim: 'valor',
    });
  });

  it.each([
    ['pendente (false) quando o login pede a segunda etapa', true, false],
    ['completa (true) quando o login não pede a segunda etapa', false, true],
  ])(
    'deve gravar a claim mfa-verified %s (RN25)',
    async (_case, secondFactorRequired, verified) => {
      mockRequest({ ip: '203.0.113.10', userAgent: 'Mozilla/5.0' });
      const startedAt = Date.now();

      await sut.createNewSession(buildInput(undefined, signInContext(secondFactorRequired)));

      expect(original.createNewSession.mock.calls[0][0].accessTokenPayload).toEqual({
        claim: 'valor',
        'mfa-verified': { v: verified, t: expect.any(Number) as number },
      });
      const payload = original.createNewSession.mock.calls[0][0].accessTokenPayload as {
        'mfa-verified': { t: number };
      };
      expect(payload['mfa-verified'].t).toBeGreaterThanOrEqual(startedAt);
    },
  );

  it('deve criar sem a claim a sessão aberta fora do login por senha', async () => {
    mockRequest(undefined);

    await sut.createNewSession(buildInput());

    expect(original.createNewSession.mock.calls[0][0].accessTokenPayload).toEqual({
      claim: 'valor',
    });
  });

  it('não deve colocar a claim nos dados da sessão no Core', async () => {
    mockRequest({ ip: '203.0.113.10', userAgent: 'Mozilla/5.0' });

    await sut.createNewSession(buildInput(undefined, signInContext(true)));

    expect(original.createNewSession.mock.calls[0][0].sessionDataInDatabase).toEqual({
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    });
  });

  it.each([
    ['a requisição não traz IP nem user agent', {}],
    ['a sessão é criada fora de uma requisição', undefined],
  ])('deve criar a sessão sem a origem quando %s', async (_case, request) => {
    mockRequest(request);

    await sut.createNewSession(buildInput());

    expect(original.createNewSession.mock.calls[0][0].sessionDataInDatabase).toEqual({
      ipAddress: null,
      userAgent: null,
    });
  });
});
