import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { InvalidUserNameError } from '../../domain/errors/invalid-user-name.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  FakeIdentityProvider,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
} from '../../testing/in-memory-users';
import { AdminInvitationService } from '../services/admin-invitation.service';
import { InviteAdminInput, InviteAdminUseCase } from './invite-admin.use-case';

const HOUR_IN_MS = 60 * 60 * 1000;

/** Segredo do link enviado no e-mail. */
function secretFrom(mailSender: FakeMailSender): string {
  const match = /convite\?token=([\w-]+)/.exec(mailSender.messages[0]?.text ?? '');

  if (!match) {
    throw new Error('Nenhum convite foi enviado.');
  }

  return match[1];
}

describe('InviteAdminUseCase', () => {
  const input: InviteAdminInput = {
    name: '  Ana Souza  ',
    email: ' Ana@Example.com ',
    invitedById: 'super-admin-1',
  };
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let mailSender: FakeMailSender;
  let sut: InviteAdminUseCase;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    mailSender = new FakeMailSender();
    sut = new InviteAdminUseCase(
      userRepository,
      identityProvider,
      new AdminInvitationService(mailSender, {
        webAppUrl: 'http://localhost:5173',
        expiresInHours: 48,
      }),
    );
  });

  it('deve criar o ADMIN PENDING, com o papel ADMIN e quem convidou (RN04, RN06)', async () => {
    await sut.execute(input);

    const admin = database.users.get('user-1');
    expect(admin).toMatchObject({
      role: Role.ADMIN,
      name: 'Ana Souza',
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
      createdById: 'super-admin-1',
    });
    expect(admin?.email.value).toBe('ana@example.com');
    expect(identityProvider.userRoles.get('user-1')).toBe(Role.ADMIN);
  });

  it('deve criar a credencial com uma senha aleatória, que ninguém conhece (RN06)', async () => {
    await sut.execute(input);

    const credential = identityProvider.credentials.get('user-1');
    expect(credential?.email).toBe('ana@example.com');
    expect(() => Password.create(credential?.password ?? '')).not.toThrow();
    expect(JSON.stringify(mailSender.messages)).not.toContain(credential?.password);
  });

  it('deve gravar só o hash do token e enviar o segredo no link do e-mail', async () => {
    await sut.execute(input);

    const secret = secretFrom(mailSender);
    const [token] = [...database.tokens.values()];
    expect(database.tokens.size).toBe(1);
    expect(token).toMatchObject({ userId: 'user-1', type: UserTokenType.INVITATION, usedAt: null });
    expect(token.tokenHash).toBe(UserToken.hash(secret));
    expect(token.tokenHash).not.toContain(secret);
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(48 * HOUR_IN_MS);
    expect(mailSender.messages[0].to).toBe('ana@example.com');
  });

  it('deve retornar o ADMIN criado e a situação do convite', async () => {
    const result = await sut.execute(input);

    const [token] = [...database.tokens.values()];
    expect(result).toEqual({
      id: 'user-1',
      role: Role.ADMIN,
      name: 'Ana Souza',
      email: 'ana@example.com',
      status: UserStatus.PENDING,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdById: 'super-admin-1',
      createdAt: expect.any(Date) as Date,
      updatedAt: expect.any(Date) as Date,
      invitation: { sent: true, expiresAt: token.expiresAt },
    });
  });

  it('deve manter o ADMIN PENDING e o convite quando o e-mail falha', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    const result = await sut.execute(input);

    expect(result.invitation.sent).toBe(false);
    expect(database.users.get('user-1')?.status).toBe(UserStatus.PENDING);
    expect(database.tokens.size).toBe(1);
    expect(identityProvider.credentials.has('user-1')).toBe(true);
  });

  it('deve recusar um e-mail já cadastrado, sem criar a credencial (RN02)', async () => {
    database.users.set(
      'client-1',
      User.createClient({ id: 'client-1', name: 'Maria', email: Email.create('ana@example.com') }),
    );

    await expect(sut.execute(input)).rejects.toThrow(EmailAlreadyInUseError);
    expect(identityProvider.credentials.size).toBe(0);
    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve repassar o conflito quando o e-mail já tem credencial no provedor', async () => {
    await identityProvider.createCredentials(Email.create(input.email), Password.random());

    await expect(sut.execute(input)).rejects.toThrow(EmailAlreadyInUseError);
    expect(database.users.size).toBe(0);
  });

  it('deve rejeitar um e-mail inválido antes de acessar o provedor', async () => {
    await expect(sut.execute({ ...input, email: 'invalido' })).rejects.toThrow(InvalidEmailError);
    expect(identityProvider.credentials.size).toBe(0);
  });

  it('deve remover a credencial e não enviar o e-mail quando a gravação no MySQL falha', async () => {
    const failure = new Error('Falha no MySQL.');
    jest.spyOn(userRepository, 'saveWithToken').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    expect(identityProvider.credentials.size).toBe(0);
    expect(identityProvider.userRoles.size).toBe(0);
    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve remover a credencial quando a atribuição do papel falha', async () => {
    const failure = new Error('Falha no SuperTokens.');
    jest.spyOn(identityProvider, 'assignRole').mockRejectedValue(failure);

    await expect(sut.execute(input)).rejects.toBe(failure);
    expect(identityProvider.credentials.size).toBe(0);
    expect(database.users.size).toBe(0);
    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve remover a credencial quando o nome é inválido', async () => {
    await expect(sut.execute({ ...input, name: '   ' })).rejects.toThrow(InvalidUserNameError);
    expect(identityProvider.credentials.size).toBe(0);
    expect(database.users.size).toBe(0);
  });
});
