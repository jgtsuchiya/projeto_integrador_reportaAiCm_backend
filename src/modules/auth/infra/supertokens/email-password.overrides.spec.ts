import type { APIInterface, RecipeInterface } from 'supertokens-node/recipe/emailpassword/types';

import {
  buildPasswordField,
  LOGIN_LOCKED_MESSAGE,
  overrideEmailPasswordApis,
  overrideEmailPasswordFunctions,
  SignInAttempt,
} from './email-password.overrides';

type SignInInput = Parameters<RecipeInterface['signIn']>[0];
type SignInResult = Awaited<ReturnType<RecipeInterface['signIn']>>;
type SignInPost = NonNullable<APIInterface['signInPOST']>;
type SignInPostInput = Parameters<SignInPost>[0];
type SignInPostResult = Awaited<ReturnType<SignInPost>>;

const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';

describe('overrideEmailPasswordApis', () => {
  const EMAIL = 'maria@example.com';
  const PASSWORD = 'senha-forte-1';
  const okResult = { status: 'OK', user: { id: USER_ID }, session: {} } as SignInPostResult;
  let original: { [Api in keyof APIInterface]: jest.Mock };
  let isLoginLocked: jest.Mock<Promise<boolean>, [string]>;
  let recordLoginAttempt: jest.Mock<Promise<void>, [SignInAttempt]>;
  let sut: APIInterface;

  beforeEach(() => {
    original = {
      signInPOST: jest.fn(),
      signUpPOST: jest.fn(),
      emailExistsGET: jest.fn(),
      generatePasswordResetTokenPOST: jest.fn(),
      passwordResetPOST: jest.fn(),
    };
    isLoginLocked = jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false);
    recordLoginAttempt = jest.fn<Promise<void>, [SignInAttempt]>().mockResolvedValue();
    sut = overrideEmailPasswordApis({ isLoginLocked, recordLoginAttempt })(original);
  });

  /** Entrada do `signInPOST`, com a requisição do Express em `options.req.original`. */
  function buildInput(
    request: { ip?: string; userAgent?: string; email?: unknown } = {},
  ): SignInPostInput {
    const { ip = '203.0.113.10', userAgent = 'Mozilla/5.0 (Linux; Android 16)' } = request;

    return {
      formFields: [
        { id: 'email', value: 'email' in request ? request.email : EMAIL },
        { id: 'password', value: PASSWORD },
      ],
      options: {
        req: {
          original: 'ip' in request ? { ip: request.ip } : { ip },
          getHeaderValue: (key: string) =>
            key === 'user-agent' && !('userAgent' in request && request.userAgent === undefined)
              ? userAgent
              : undefined,
        },
      },
    } as unknown as SignInPostInput;
  }

  function signIn(input: SignInPostInput = buildInput()): Promise<SignInPostResult> {
    return sut.signInPOST!(input);
  }

  it('deve desativar o cadastro, a checagem de e-mail e o reset (RN16)', () => {
    expect(sut.signInPOST).toEqual(expect.any(Function));
    expect(sut.signUpPOST).toBeUndefined();
    expect(sut.emailExistsGET).toBeUndefined();
    expect(sut.generatePasswordResetTokenPOST).toBeUndefined();
    expect(sut.passwordResetPOST).toBeUndefined();
  });

  it('deve manter o sign-in desativado se o SuperTokens não o oferecer', () => {
    const withoutSignIn = overrideEmailPasswordApis({ isLoginLocked, recordLoginAttempt })({
      ...original,
      signInPOST: undefined,
    });

    expect(withoutSignIn.signInPOST).toBeUndefined();
  });

  it('deve conferir o bloqueio do e-mail antes de a senha ser conferida', async () => {
    const order: string[] = [];
    isLoginLocked.mockImplementation(async () => {
      order.push('bloqueio');

      return false;
    });
    original.signInPOST.mockImplementation(async () => {
      order.push('senha');

      return okResult;
    });
    const input = buildInput();

    const result = await signIn(input);

    expect(result).toBe(okResult);
    expect(order).toEqual(['bloqueio', 'senha']);
    expect(isLoginLocked).toHaveBeenCalledWith(EMAIL);
    expect(original.signInPOST).toHaveBeenCalledWith(input);
  });

  it('deve chamar o sign-in original como método, porque o SuperTokens o resolve pelo this', async () => {
    original.signInPOST.mockResolvedValue(okResult);

    await signIn();

    expect(original.signInPOST.mock.contexts).toEqual([original]);
  });

  it('deve recusar o login do e-mail bloqueado sem conferir a senha e sem registrar (RN17)', async () => {
    isLoginLocked.mockResolvedValue(true);

    const result = await signIn();

    expect(result).toEqual({
      status: 'GENERAL_ERROR',
      message: 'Muitas tentativas. Tente novamente em alguns minutos.',
    });
    expect(LOGIN_LOCKED_MESSAGE).toBe('Muitas tentativas. Tente novamente em alguns minutos.');
    expect(original.signInPOST).not.toHaveBeenCalled();
    expect(recordLoginAttempt).not.toHaveBeenCalled();
  });

  it('deve registrar o login com sucesso, com o e-mail, o IP e o user agent (RN19)', async () => {
    original.signInPOST.mockResolvedValue(okResult);

    await signIn();

    expect(recordLoginAttempt).toHaveBeenCalledTimes(1);
    expect(recordLoginAttempt).toHaveBeenCalledWith({
      email: EMAIL,
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (Linux; Android 16)',
      succeeded: true,
    });
  });

  it.each([
    ['a credencial inválida, que inclui a recusa da RN09', { status: 'WRONG_CREDENTIALS_ERROR' }],
    ['o login não permitido', { status: 'SIGN_IN_NOT_ALLOWED', reason: 'motivo' }],
    ['um erro geral', { status: 'GENERAL_ERROR', message: 'mensagem' }],
  ])('deve registrar como falha %s', async (_case, failure) => {
    original.signInPOST.mockResolvedValue(failure);

    const result = await signIn();

    expect(result).toBe(failure);
    expect(recordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ succeeded: false }));
  });

  it('nunca deve entregar a senha para o registro da tentativa', async () => {
    original.signInPOST.mockResolvedValue({ status: 'WRONG_CREDENTIALS_ERROR' });

    await signIn();

    expect(JSON.stringify(recordLoginAttempt.mock.calls)).not.toContain(PASSWORD);
    expect(JSON.stringify(isLoginLocked.mock.calls)).not.toContain(PASSWORD);
  });

  it('deve registrar a tentativa sem IP e sem user agent quando a requisição não os traz', async () => {
    original.signInPOST.mockResolvedValue({ status: 'WRONG_CREDENTIALS_ERROR' });

    await signIn(buildInput({ ip: undefined, userAgent: undefined }));

    expect(recordLoginAttempt).toHaveBeenCalledWith({
      email: EMAIL,
      ipAddress: null,
      userAgent: null,
      succeeded: false,
    });
  });

  it('não deve registrar a tentativa quando o SuperTokens falha ao conferir a senha', async () => {
    original.signInPOST.mockRejectedValue(new Error('Core fora do ar.'));

    await expect(signIn()).rejects.toThrow('Core fora do ar.');
    expect(recordLoginAttempt).not.toHaveBeenCalled();
  });

  it('deve deixar o SuperTokens responder quando o campo e-mail não é um texto', async () => {
    original.signInPOST.mockRejectedValue(new Error('Should never come here.'));

    await expect(signIn(buildInput({ email: 123 }))).rejects.toThrow('Should never come here.');
    expect(isLoginLocked).not.toHaveBeenCalled();
    expect(recordLoginAttempt).not.toHaveBeenCalled();
  });
});

describe('overrideEmailPasswordFunctions', () => {
  const input = { email: 'maria@example.com', password: 'senha-forte-1' } as SignInInput;
  const okResult = {
    status: 'OK',
    user: { id: USER_ID },
    recipeUserId: {},
  } as unknown as SignInResult;
  let original: jest.Mocked<Pick<RecipeInterface, 'signIn' | 'verifyCredentials'>>;
  let authorizeSignIn: jest.Mock<Promise<boolean>, [string]>;
  let sut: RecipeInterface;

  beforeEach(() => {
    original = { signIn: jest.fn(), verifyCredentials: jest.fn() };
    authorizeSignIn = jest.fn<Promise<boolean>, [string]>();
    sut = overrideEmailPasswordFunctions({ authorizeSignIn })(
      original as unknown as RecipeInterface,
    );
  });

  it('deve manter as demais funções da receita', () => {
    expect(sut.verifyCredentials).toBe(original.verifyCredentials);
  });

  it('deve concluir o login quando a aplicação autoriza o usuário', async () => {
    original.signIn.mockResolvedValue(okResult);
    authorizeSignIn.mockResolvedValue(true);

    const result = await sut.signIn(input);

    expect(result).toBe(okResult);
    expect(original.signIn).toHaveBeenCalledWith(input);
    expect(authorizeSignIn).toHaveBeenCalledWith(USER_ID);
  });

  it('deve responder como senha incorreta quando a aplicação recusa o usuário', async () => {
    original.signIn.mockResolvedValue(okResult);
    authorizeSignIn.mockResolvedValue(false);

    const result = await sut.signIn(input);

    expect(result).toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
  });

  it('não deve consultar a aplicação quando a senha está incorreta', async () => {
    original.signIn.mockResolvedValue({ status: 'WRONG_CREDENTIALS_ERROR' });

    const result = await sut.signIn(input);

    expect(result).toEqual({ status: 'WRONG_CREDENTIALS_ERROR' });
    expect(authorizeSignIn).not.toHaveBeenCalled();
  });
});

describe('buildPasswordField', () => {
  const checkPasswordPolicy = jest.fn<Promise<string | null>, [string]>();
  const sut = buildPasswordField({ checkPasswordPolicy });

  function validate(value: unknown): Promise<string | undefined> {
    return sut.validate!(value, 'public', {} as Parameters<NonNullable<typeof sut.validate>>[2]);
  }

  it('deve configurar o campo password', () => {
    expect(sut.id).toBe('password');
  });

  it('deve aceitar uma senha que segue a política', async () => {
    checkPasswordPolicy.mockResolvedValue(null);

    await expect(validate('senha-forte-1')).resolves.toBeUndefined();
    expect(checkPasswordPolicy).toHaveBeenCalledWith('senha-forte-1');
  });

  it('deve retornar a mensagem da política quando a senha é inválida', async () => {
    checkPasswordPolicy.mockResolvedValue('A senha deve ter pelo menos uma letra e um número.');

    await expect(validate('somenteletras')).resolves.toBe(
      'A senha deve ter pelo menos uma letra e um número.',
    );
  });

  it('deve recusar um valor que não é texto', async () => {
    await expect(validate(12345678)).resolves.toBe('A senha é obrigatória.');
    expect(checkPasswordPolicy).not.toHaveBeenCalled();
  });
});
