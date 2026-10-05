import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { Role } from '../../domain/value-objects/role';
import {
  FakeIdentityProvider,
  InMemoryUserRepository,
  InMemoryUsersDatabase,
  InMemoryUserTokenRepository,
} from '../../testing/in-memory-users';
import { AdminInvitationService } from '../services/admin-invitation.service';
import { UserMailService } from '../services/user-mail.service';
import { DeleteAdminUseCase } from './delete-admin.use-case';

describe('DeleteAdminUseCase', () => {
  let database: InMemoryUsersDatabase;
  let userRepository: InMemoryUserRepository;
  let identityProvider: FakeIdentityProvider;
  let invitationService: AdminInvitationService;
  let sut: DeleteAdminUseCase;
  let admin: User;

  beforeEach(async () => {
    database = new InMemoryUsersDatabase();
    userRepository = new InMemoryUserRepository(database);
    identityProvider = new FakeIdentityProvider();
    invitationService = new AdminInvitationService(
      new UserMailService(new FakeMailSender(), { webAppUrl: 'http://localhost:5173' }),
      { expiresInHours: 48 },
    );
    sut = new DeleteAdminUseCase(
      userRepository,
      new InMemoryUserTokenRepository(database),
      identityProvider,
    );

    const id = await identityProvider.createCredentials(
      Email.create('ana@example.com'),
      Password.random(),
    );
    await identityProvider.assignRole(id, Role.ADMIN);
    admin = User.createAdmin({
      id,
      name: 'Ana Souza',
      email: Email.create('ana@example.com'),
      createdById: 'super-1',
    });
    const { token } = invitationService.issue(admin.id);
    database.users.set(admin.id, admin);
    database.tokens.set(token.id, token);
  });

  it('deve excluir o ADMIN, anonimizando o e-mail e mantendo o nome (RN11)', async () => {
    const save = jest.spyOn(userRepository, 'save');

    await sut.execute({ adminId: admin.id });

    expect(admin.isDeleted).toBe(true);
    expect(admin.email.value).toBe(`deleted+${admin.id}@reportaai.invalid`);
    expect(admin.name).toBe('Ana Souza');
    expect(save).toHaveBeenCalledWith(admin);
    await expect(userRepository.findById(admin.id)).resolves.toBeNull();
  });

  it('deve remover o ADMIN do SuperTokens e cancelar o convite pendente', async () => {
    await sut.execute({ adminId: admin.id });

    expect(identityProvider.credentials.has(admin.id)).toBe(false);
    expect(identityProvider.userRoles.has(admin.id)).toBe(false);
    expect(database.tokens.size).toBe(0);
  });

  it('deve manter os convites de outros ADMINs', async () => {
    const other = invitationService.issue('admin-2').token;
    database.tokens.set(other.id, other);

    await sut.execute({ adminId: admin.id });

    expect([...database.tokens.keys()]).toEqual([other.id]);
  });

  it('deve liberar o e-mail para um novo cadastro', async () => {
    await sut.execute({ adminId: admin.id });

    await expect(userRepository.existsByEmail(Email.create('ana@example.com'))).resolves.toBe(
      false,
    );
    await expect(
      identityProvider.createCredentials(Email.create('ana@example.com'), Password.random()),
    ).resolves.toEqual(expect.any(String));
  });

  it('deve excluir um ADMIN ativo ou inativo', async () => {
    admin.acceptInvitation();
    admin.deactivate();

    await sut.execute({ adminId: admin.id });

    expect(admin.isDeleted).toBe(true);
  });

  it('deve remover do SuperTokens antes de gravar no MySQL, para a exclusão poder ser repetida', async () => {
    jest.spyOn(userRepository, 'save').mockRejectedValueOnce(new Error('Falha no MySQL.'));

    await expect(sut.execute({ adminId: admin.id })).rejects.toThrow('Falha no MySQL.');
    expect(identityProvider.credentials.has(admin.id)).toBe(false);
  });

  it('deve responder que o ADMIN não existe para um id já excluído', async () => {
    await sut.execute({ adminId: admin.id });

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
    const deleteCredentials = jest.spyOn(identityProvider, 'deleteCredentials');

    await expect(sut.execute({ adminId: user.id })).rejects.toThrow(UserNotFoundError);
    expect(user.isDeleted).toBe(false);
    expect(deleteCredentials).not.toHaveBeenCalled();
  });
});
