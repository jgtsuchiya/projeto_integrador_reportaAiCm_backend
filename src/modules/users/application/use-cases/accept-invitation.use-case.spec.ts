import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { InvalidPasswordError } from '../../domain/errors/invalid-password.error';
import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { UserStatus } from '../../domain/value-objects/user-status';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  FakeIdentityProvider,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { AcceptInvitationUseCase } from './accept-invitation.use-case';

const PASSWORD = 'senha-forte-1';

describe('AcceptInvitationUseCase', () => {
  let database: InMemoryUsersDatabase;
  let tokenRepository: InMemoryUserTokenRepository;
  let identityProvider: FakeIdentityProvider;
  let sut: AcceptInvitationUseCase;
  let admin: User;
  let token: UserToken;
  let secret: string;
  let discardedPassword: string;

  beforeEach(async () => {
    database = new InMemoryUsersDatabase();
    tokenRepository = new InMemoryUserTokenRepository(database);
    identityProvider = new FakeIdentityProvider();
    sut = new AcceptInvitationUseCase(
      new InMemoryUserRepository(database),
      tokenRepository,
      identityProvider,
    );

    const email = Email.create('ana@example.com');
    const random = Password.random();
    discardedPassword = random.value;
    const adminId = await identityProvider.createCredentials(email, random);
    admin = User.createAdmin({ id: adminId, name: 'Ana', email, createdById: 'super-admin-1' });
    ({ token, secret } = UserToken.issue({
      userId: adminId,
      type: UserTokenType.INVITATION,
      validForHours: 48,
    }));
    database.users.set(admin.id, admin);
    database.tokens.set(token.id, token);
  });

  it('deve definir a senha, ativar o ADMIN e marcar o token como usado (RN06)', async () => {
    await sut.execute({ token: secret, password: PASSWORD });

    expect(identityProvider.credentials.get(admin.id)?.password).toBe(PASSWORD);
    expect(admin.status).toBe(UserStatus.ACTIVE);
    expect(admin.emailVerifiedAt).toBeInstanceOf(Date);
    expect(token.usedAt).toBeInstanceOf(Date);
    expect(admin.canAccess()).toBe(true);
  });

  it('deve aplicar a política de senha antes de consultar o token (RN08)', async () => {
    const findByHash = jest.spyOn(tokenRepository, 'findByHash');

    await expect(sut.execute({ token: secret, password: 'somenteletras' })).rejects.toThrow(
      InvalidPasswordError,
    );
    expect(findByHash).not.toHaveBeenCalled();
    expect(admin.status).toBe(UserStatus.PENDING);
  });

  it('deve recusar um token que não existe', async () => {
    await expect(sut.execute({ token: 'token-inexistente', password: PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );
  });

  it('deve recusar um token já usado (uso único)', async () => {
    await sut.execute({ token: secret, password: PASSWORD });

    await expect(sut.execute({ token: secret, password: 'outra-senha-2' })).rejects.toThrow(
      InvalidUserTokenError,
    );
    expect(identityProvider.credentials.get(admin.id)?.password).toBe(PASSWORD);
  });

  it('deve recusar um token expirado, sem trocar a senha', async () => {
    const expired = UserToken.restore('token-expirado', {
      userId: admin.id,
      type: UserTokenType.INVITATION,
      tokenHash: UserToken.hash('segredo-expirado'),
      expiresAt: new Date(Date.now() - 1),
      usedAt: null,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    database.tokens.set(expired.id, expired);

    await expect(sut.execute({ token: 'segredo-expirado', password: PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );
    expect(identityProvider.credentials.get(admin.id)?.password).toBe(discardedPassword);
    expect(admin.status).toBe(UserStatus.PENDING);
  });

  it('deve recusar um token substituído por reenvio', async () => {
    await tokenRepository.replace(
      UserToken.issue({ userId: admin.id, type: UserTokenType.INVITATION, validForHours: 48 })
        .token,
    );

    await expect(sut.execute({ token: secret, password: PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );
  });

  it('deve recusar o convite de um ADMIN excluído', async () => {
    admin.delete();

    await expect(sut.execute({ token: secret, password: PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );
    expect(identityProvider.credentials.get(admin.id)?.password).toBe(discardedPassword);
  });

  it('deve recusar o convite de um ADMIN que não está mais PENDING', async () => {
    admin.acceptInvitation();
    admin.deactivate();

    await expect(sut.execute({ token: secret, password: PASSWORD })).rejects.toThrow(
      InvalidUserTokenError,
    );
    expect(admin.status).toBe(UserStatus.INACTIVE);
    expect(token.usedAt).toBeNull();
  });
});
