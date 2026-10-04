import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { AdminNotPendingError } from '../../domain/errors/admin-not-pending.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { AdminInvitationService } from '../services/admin-invitation.service';
import { ResendAdminInvitationUseCase } from './resend-admin-invitation.use-case';

describe('ResendAdminInvitationUseCase', () => {
  let database: InMemoryUsersDatabase;
  let mailSender: FakeMailSender;
  let invitationService: AdminInvitationService;
  let sut: ResendAdminInvitationUseCase;
  let admin: User;
  let previousToken: UserToken;

  beforeEach(() => {
    database = new InMemoryUsersDatabase();
    mailSender = new FakeMailSender();
    invitationService = new AdminInvitationService(mailSender, {
      webAppUrl: 'http://localhost:5173',
      expiresInHours: 48,
    });
    sut = new ResendAdminInvitationUseCase(
      new InMemoryUserRepository(database),
      new InMemoryUserTokenRepository(database),
      invitationService,
    );

    admin = User.createAdmin({
      id: 'admin-1',
      name: 'Ana Souza',
      email: Email.create('ana@example.com'),
      createdById: 'super-admin-1',
    });
    previousToken = invitationService.issue(admin.id).token;
    database.users.set(admin.id, admin);
    database.tokens.set(previousToken.id, previousToken);
  });

  it('deve substituir o convite anterior e enviar um link novo (RN06)', async () => {
    const result = await sut.execute({ adminId: admin.id });

    const tokens = [...database.tokens.values()];
    expect(tokens).toHaveLength(1);
    expect(tokens[0].id).not.toBe(previousToken.id);
    expect(tokens[0]).toMatchObject({ userId: admin.id, type: UserTokenType.INVITATION });
    expect(result).toEqual({ sent: true, expiresAt: tokens[0].expiresAt });
    expect(mailSender.messages).toHaveLength(1);
    expect(mailSender.messages[0].to).toBe('ana@example.com');
    const secret = /token=([\w-]+)/.exec(mailSender.messages[0].text)?.[1] ?? '';
    expect(tokens[0].tokenHash).toBe(UserToken.hash(secret));
  });

  it('deve manter os convites de outros ADMINs', async () => {
    const otherToken = invitationService.issue('admin-2').token;
    database.tokens.set(otherToken.id, otherToken);

    await sut.execute({ adminId: admin.id });

    expect(database.tokens.has(otherToken.id)).toBe(true);
    expect(database.tokens.has(previousToken.id)).toBe(false);
  });

  it('deve responder sent: false quando o e-mail falha, com o convite novo já gravado', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    const result = await sut.execute({ adminId: admin.id });

    expect(result.sent).toBe(false);
    expect(database.tokens.has(previousToken.id)).toBe(false);
    expect(database.tokens.size).toBe(1);
  });

  it('deve recusar o reenvio para um ADMIN que já aceitou o convite (RN06)', async () => {
    admin.acceptInvitation();

    await expect(sut.execute({ adminId: admin.id })).rejects.toThrow(AdminNotPendingError);
    expect(database.tokens.has(previousToken.id)).toBe(true);
    expect(mailSender.messages).toHaveLength(0);
  });

  it('deve responder que o ADMIN não existe para um id desconhecido ou excluído', async () => {
    await expect(sut.execute({ adminId: 'desconhecido' })).rejects.toThrow(UserNotFoundError);

    admin.delete();
    await expect(sut.execute({ adminId: admin.id })).rejects.toThrow(UserNotFoundError);
  });

  it.each([
    [
      'CLIENT',
      User.createClient({ id: 'client-1', name: 'Maria', email: Email.create('m@x.com') }),
    ],
    [
      'SUPER_ADMIN',
      User.createSuperAdmin({ id: 'super-1', name: 'Super', email: Email.create('s@x.com') }),
    ],
  ])('deve responder que o ADMIN não existe para o id de um %s', async (_role, user) => {
    database.users.set(user.id, user);

    await expect(sut.execute({ adminId: user.id })).rejects.toThrow(UserNotFoundError);
    expect(mailSender.messages).toHaveLength(0);
  });
});
