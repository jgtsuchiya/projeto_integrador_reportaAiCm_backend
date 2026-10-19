import { LOGIN_CODE_MAX_ATTEMPTS, UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { InvalidLoginCodeError } from '../../domain/errors/invalid-login-code.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { VerifyLoginCodeUseCase } from './verify-login-code.use-case';

const MINUTE_IN_MS = 60 * 1000;
const CODE = '042137';
const WRONG_CODE = '999999';

describe('VerifyLoginCodeUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let tokenRepository: InMemoryUserTokenRepository;
  let sut: VerifyLoginCodeUseCase;
  let user: User;
  let token: UserToken;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    tokenRepository = new InMemoryUserTokenRepository(database);
    sut = new VerifyLoginCodeUseCase(userRepository, tokenRepository);

    user = createClient('client-1', 'maria@example.com');
    token = saveCode(user, CODE);
  });

  function createClient(id: string, email: string): User {
    const client = User.createClient({ id, name: 'Maria', email: Email.create(email) });
    database.users.set(client.id, client);

    return client;
  }

  /** Grava o código vigente da conta, com o valor escolhido pelo teste. */
  function saveCode(
    owner: User,
    code: string,
    props: { expiresAt?: Date; usedAt?: Date; attempts?: number; type?: UserTokenType } = {},
  ): UserToken {
    const createdAt = new Date(Date.now() - MINUTE_IN_MS);
    const saved = UserToken.restore(`token-${owner.id}`, {
      userId: owner.id,
      type: props.type ?? UserTokenType.LOGIN_CODE,
      tokenHash: UserToken.hashCode(owner.id, code),
      attempts: props.attempts ?? 0,
      expiresAt: props.expiresAt ?? new Date(createdAt.getTime() + 10 * MINUTE_IN_MS),
      usedAt: props.usedAt ?? null,
      createdAt,
    });
    database.tokens.set(saved.id, saved);

    return saved;
  }

  function verify(code: string): Promise<void> {
    return sut.execute({ userId: user.id, code });
  }

  it('deve marcar o código como usado e registrar o último acesso (RN25)', async () => {
    const saveSpy = jest.spyOn(userRepository, 'save');
    expect(user.lastLoginAt).toBeNull();

    await verify(CODE);

    expect(token.usedAt).toBeInstanceOf(Date);
    expect(token.isUsable()).toBe(false);
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    expect(saveSpy).toHaveBeenCalledWith(user);
  });

  it('deve recusar o código errado, contando o erro e sem concluir o login', async () => {
    await expect(verify(WRONG_CODE)).rejects.toThrow(InvalidLoginCodeError);

    expect(token.attempts).toBe(1);
    expect(token.usedAt).toBeNull();
    expect(user.lastLoginAt).toBeNull();
  });

  it('deve aceitar o código certo depois de menos de 5 erros', async () => {
    for (let attempt = 1; attempt < LOGIN_CODE_MAX_ATTEMPTS; attempt++) {
      await expect(verify(WRONG_CODE)).rejects.toThrow(InvalidLoginCodeError);
    }

    await expect(verify(CODE)).resolves.toBeUndefined();

    expect(token.attempts).toBe(LOGIN_CODE_MAX_ATTEMPTS - 1);
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  it('deve invalidar o código no 5º erro: nem o código certo entra depois', async () => {
    for (let attempt = 1; attempt <= LOGIN_CODE_MAX_ATTEMPTS; attempt++) {
      await expect(verify(WRONG_CODE)).rejects.toThrow(InvalidLoginCodeError);
    }

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);

    expect(token.attempts).toBe(LOGIN_CODE_MAX_ATTEMPTS);
    expect(token.usedAt).toBeNull();
    expect(user.lastLoginAt).toBeNull();
  });

  it('não deve contar erros além do limite', async () => {
    const saveSpy = jest.spyOn(tokenRepository, 'saveFailedAttempt');
    token = saveCode(user, CODE, { attempts: LOGIN_CODE_MAX_ATTEMPTS });

    await expect(verify(WRONG_CODE)).rejects.toThrow(InvalidLoginCodeError);

    expect(token.attempts).toBe(LOGIN_CODE_MAX_ATTEMPTS);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('não deve aceitar de novo um código já usado', async () => {
    await verify(CODE);
    const firstLoginAt = user.lastLoginAt;

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);

    expect(user.lastLoginAt).toBe(firstLoginAt);
  });

  it('deve recusar o código expirado, sem contar erro', async () => {
    token = saveCode(user, CODE, { expiresAt: new Date(Date.now() - 1) });

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);

    expect(token.attempts).toBe(0);
    expect(user.lastLoginAt).toBeNull();
  });

  it('deve recusar quando a conta não tem código', async () => {
    database.tokens.clear();

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);
  });

  it('não deve aceitar o código de outra conta', async () => {
    const other = createClient('client-2', 'joao@example.com');
    const otherToken = saveCode(other, '555555');

    await expect(verify('555555')).rejects.toThrow(InvalidLoginCodeError);

    // O erro conta no código de quem tentou, e o da outra conta continua intacto.
    expect(token.attempts).toBe(1);
    expect(otherToken.attempts).toBe(0);
    expect(otherToken.usedAt).toBeNull();
  });

  it('não deve aceitar o mesmo valor de código emitido para outra conta', async () => {
    database.tokens.clear();
    const other = createClient('client-2', 'joao@example.com');
    saveCode(other, CODE);

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);
  });

  it('não deve aceitar um token de outro tipo como código', async () => {
    database.tokens.clear();
    saveCode(user, CODE, { type: UserTokenType.PASSWORD_RESET });

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);
  });

  it('deve recusar o código certo quando outra conferência chegou antes no banco', async () => {
    jest.spyOn(tokenRepository, 'consume').mockResolvedValue(false);

    await expect(verify(CODE)).rejects.toThrow(InvalidLoginCodeError);

    expect(user.lastLoginAt).toBeNull();
  });

  it('deve usar a mesma mensagem para todo código recusado', async () => {
    const wrong = await verify(WRONG_CODE).catch((error: unknown) => error);
    database.tokens.clear();
    const missing = await verify(CODE).catch((error: unknown) => error);

    expect(wrong).toBeInstanceOf(InvalidLoginCodeError);
    expect(missing).toBeInstanceOf(InvalidLoginCodeError);
    expect((wrong as Error).message).toBe((missing as Error).message);
  });

  it.each([
    ['inexistente', (): void => void database.users.clear()],
    ['excluído', (): void => user.delete()],
  ])('deve lançar UserNotFoundError para um usuário %s', async (_case, arrange) => {
    arrange();

    await expect(verify(CODE)).rejects.toThrow(UserNotFoundError);

    expect(token.usedAt).toBeNull();
    expect(token.attempts).toBe(0);
  });
});
