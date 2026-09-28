import type { APIInterface, RecipeInterface } from 'supertokens-node/recipe/emailpassword/types';

import {
  buildPasswordField,
  overrideEmailPasswordApis,
  overrideEmailPasswordFunctions,
} from './email-password.overrides';

type SignInInput = Parameters<RecipeInterface['signIn']>[0];
type SignInResult = Awaited<ReturnType<RecipeInterface['signIn']>>;

const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';

describe('overrideEmailPasswordApis', () => {
  const original = {
    signInPOST: jest.fn(),
    signUpPOST: jest.fn(),
    emailExistsGET: jest.fn(),
    generatePasswordResetTokenPOST: jest.fn(),
    passwordResetPOST: jest.fn(),
  } as unknown as APIInterface;

  it('deve manter só o sign-in e desativar o cadastro, a checagem de e-mail e o reset', () => {
    const sut = overrideEmailPasswordApis(original);

    expect(sut.signInPOST).toBe(original.signInPOST);
    expect(sut.signUpPOST).toBeUndefined();
    expect(sut.emailExistsGET).toBeUndefined();
    expect(sut.generatePasswordResetTokenPOST).toBeUndefined();
    expect(sut.passwordResetPOST).toBeUndefined();
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
