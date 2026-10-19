import { UserToken } from '../../domain/entities/user-token.entity';
import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { UserLinkTokenType, UserTokenType } from '../../domain/value-objects/user-token-type';
import { InMemoryUsersDatabase, InMemoryUserTokenRepository } from '../../testing/in-memory-users';
import { findUsableTokenOrFail } from './find-user-token';

const LINK_TYPES: readonly UserLinkTokenType[] = [
  UserTokenType.INVITATION,
  UserTokenType.PASSWORD_RESET,
  UserTokenType.EMAIL_VERIFICATION,
];

describe('findUsableTokenOrFail', () => {
  let database: InMemoryUsersDatabase;
  let repository: InMemoryUserTokenRepository;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    repository = new InMemoryUserTokenRepository(database);
  });

  function issue(
    type: UserLinkTokenType,
    validForMinutes = 60,
  ): { token: UserToken; secret: string } {
    const issued = UserToken.issue({ userId: 'user-1', type, validForMinutes });
    database.tokens.set(issued.token.id, issued.token);

    return issued;
  }

  it.each(LINK_TYPES)('deve devolver o token do tipo %s recebido no link', async (type) => {
    const { token, secret } = issue(type);

    await expect(findUsableTokenOrFail(repository, secret, type)).resolves.toBe(token);
  });

  it.each(
    LINK_TYPES.flatMap((type) =>
      LINK_TYPES.filter((flow) => flow !== type).map((flow) => [type, flow] as const),
    ),
  )('não deve aceitar o token do tipo %s no fluxo de %s', async (type, flow) => {
    const { secret } = issue(type);

    await expect(findUsableTokenOrFail(repository, secret, flow)).rejects.toThrow(
      InvalidUserTokenError,
    );
  });

  it.each(LINK_TYPES)('não deve aceitar o código da segunda etapa no fluxo de %s', async (flow) => {
    const { token, secret } = UserToken.issueCode({ userId: 'user-1', validForMinutes: 10 });
    database.tokens.set(token.id, token);

    await expect(findUsableTokenOrFail(repository, secret, flow)).rejects.toThrow(
      InvalidUserTokenError,
    );
  });

  it('não deve aceitar um token que não existe', async () => {
    await expect(
      findUsableTokenOrFail(repository, 'token-inexistente', UserTokenType.PASSWORD_RESET),
    ).rejects.toThrow(InvalidUserTokenError);
  });

  it('não deve aceitar um token expirado', async () => {
    const { secret } = issue(UserTokenType.PASSWORD_RESET, -1);

    await expect(
      findUsableTokenOrFail(repository, secret, UserTokenType.PASSWORD_RESET),
    ).rejects.toThrow(InvalidUserTokenError);
  });

  it('não deve aceitar um token já usado', async () => {
    const { token, secret } = issue(UserTokenType.EMAIL_VERIFICATION);
    token.use();

    await expect(
      findUsableTokenOrFail(repository, secret, UserTokenType.EMAIL_VERIFICATION),
    ).rejects.toThrow(InvalidUserTokenError);
  });

  it('não deve aceitar um token substituído por um pedido novo', async () => {
    const { secret } = issue(UserTokenType.PASSWORD_RESET);
    const replacement = UserToken.issue({
      userId: 'user-1',
      type: UserTokenType.PASSWORD_RESET,
      validForMinutes: 60,
    });
    await repository.replace(replacement.token);

    await expect(
      findUsableTokenOrFail(repository, secret, UserTokenType.PASSWORD_RESET),
    ).rejects.toThrow(InvalidUserTokenError);
    await expect(
      findUsableTokenOrFail(repository, replacement.secret, UserTokenType.PASSWORD_RESET),
    ).resolves.toBe(replacement.token);
  });
});
