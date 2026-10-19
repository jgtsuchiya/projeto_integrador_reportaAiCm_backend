import { IssuedUserToken, UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { Email } from '../../domain/value-objects/email';
import { UserLinkTokenType, UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { VerifyEmailUseCase } from './verify-email.use-case';

const HOUR_IN_MS = 60 * 60 * 1000;

describe('VerifyEmailUseCase', () => {
  const email = Email.create('maria@example.com');
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let sut: VerifyEmailUseCase;
  let user: User;
  let token: UserToken;
  let secret: string;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    sut = new VerifyEmailUseCase(userRepository, new InMemoryUserTokenRepository(database));

    user = User.createClient({ id: 'client-1', name: 'Maria', email });
    database.users.set(user.id, user);
    ({ token, secret } = issueToken(UserTokenType.EMAIL_VERIFICATION));
  });

  function issueToken(type: UserLinkTokenType): IssuedUserToken {
    const issued = UserToken.issue({ userId: user.id, type, validForMinutes: 24 * 60 });
    database.tokens.set(issued.token.id, issued.token);

    return issued;
  }

  /** Troca o token da conta por um com as datas informadas e o mesmo segredo. */
  function restoreToken(props: { expiresAt?: Date; usedAt?: Date }): void {
    database.tokens.set(
      token.id,
      UserToken.restore(token.id, {
        userId: user.id,
        type: UserTokenType.EMAIL_VERIFICATION,
        tokenHash: token.tokenHash,
        attempts: 0,
        expiresAt: props.expiresAt ?? token.expiresAt,
        usedAt: props.usedAt ?? null,
        createdAt: token.createdAt,
      }),
    );
  }

  it('deve preencher o email_verified_at e marcar o token como usado (RN22)', async () => {
    expect(user.emailVerifiedAt).toBeNull();

    await sut.execute({ token: secret });

    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(token.usedAt).toBeInstanceOf(Date);
    expect(token.isUsable()).toBe(false);
  });

  it('deve gravar o usuário e o token juntos', async () => {
    const saveWithToken = jest.spyOn(userRepository, 'saveWithToken');

    await sut.execute({ token: secret });

    expect(saveWithToken).toHaveBeenCalledWith(user, token);
  });

  it('deve recusar o mesmo link na segunda vez', async () => {
    await sut.execute({ token: secret });

    await expect(sut.execute({ token: secret })).rejects.toThrow(InvalidUserTokenError);
  });

  it('deve manter a data de quem já verificou o e-mail por outro caminho, consumindo o link', async () => {
    // A redefinição de senha também verifica o e-mail (RN21).
    user.verifyEmail();
    const verifiedAt = user.emailVerifiedAt;

    await sut.execute({ token: secret });

    expect(user.emailVerifiedAt).toBe(verifiedAt);
    expect(token.usedAt).toBeInstanceOf(Date);
  });

  it('deve confirmar o e-mail de uma conta INACTIVE, que continua sem acesso', async () => {
    user.deactivate();

    await sut.execute({ token: secret });

    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.canAccess()).toBe(false);
  });

  it('deve recusar um token inexistente', async () => {
    await expect(sut.execute({ token: 'token-que-nao-existe' })).rejects.toThrow(
      InvalidUserTokenError,
    );
  });

  it('deve recusar um token expirado', async () => {
    restoreToken({ expiresAt: new Date(Date.now() - 1000) });

    await expect(sut.execute({ token: secret })).rejects.toThrow(InvalidUserTokenError);
    expect(user.emailVerifiedAt).toBeNull();
  });

  it('deve recusar um token já usado', async () => {
    restoreToken({ usedAt: new Date(Date.now() - HOUR_IN_MS) });

    await expect(sut.execute({ token: secret })).rejects.toThrow(InvalidUserTokenError);
    expect(user.emailVerifiedAt).toBeNull();
  });

  it.each([UserTokenType.INVITATION, UserTokenType.PASSWORD_RESET] as const)(
    'deve recusar um token do tipo %s, sem consumi-lo',
    async (type) => {
      const other = issueToken(type);

      await expect(sut.execute({ token: other.secret })).rejects.toThrow(InvalidUserTokenError);
      expect(user.emailVerifiedAt).toBeNull();
      expect(other.token.usedAt).toBeNull();
    },
  );

  it('deve recusar o token de uma conta excluída, sem consumi-lo', async () => {
    user.delete();

    await expect(sut.execute({ token: secret })).rejects.toThrow(InvalidUserTokenError);
    expect(token.usedAt).toBeNull();
  });
});
