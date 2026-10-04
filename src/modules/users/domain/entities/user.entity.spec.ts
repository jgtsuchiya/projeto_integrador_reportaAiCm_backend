import { InvalidStatusTransitionError } from '../errors/invalid-status-transition.error';
import { InvalidUserNameError } from '../errors/invalid-user-name.error';
import { SuperAdminProtectedError } from '../errors/super-admin-protected.error';
import { UserAlreadyDeletedError } from '../errors/user-already-deleted.error';
import { Email } from '../value-objects/email';
import { Role } from '../value-objects/role';
import { UserStatus } from '../value-objects/user-status';
import { DELETED_USER_NAME, User, UserProps } from './user.entity';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const LATER = new Date('2026-09-28T08:30:00.000Z');
const USER_ID = '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b';
const SUPER_ADMIN_ID = '0b7e4c2a-1d3f-4e5a-8b6c-9d0e1f2a3b4c';

function input(overrides: Partial<{ name: string; email: string }> = {}): {
  id: string;
  name: string;
  email: Email;
} {
  return {
    id: USER_ID,
    name: overrides.name ?? 'Maria da Silva',
    email: Email.create(overrides.email ?? 'maria@example.com'),
  };
}

function restore(overrides: Partial<UserProps> = {}): User {
  return User.restore(USER_ID, {
    role: Role.CLIENT,
    name: 'Maria da Silva',
    email: Email.create('maria@example.com'),
    status: UserStatus.ACTIVE,
    emailVerifiedAt: null,
    mfaEnabled: false,
    lastLoginAt: null,
    createdById: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  });
}

describe('User', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('criação', () => {
    it('deve criar o CLIENT ACTIVE, com o id do provedor de identidade (RN05)', () => {
      const sut = User.createClient(input());

      expect(sut.id).toBe(USER_ID);
      expect(sut).toMatchObject({
        role: Role.CLIENT,
        name: 'Maria da Silva',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        mfaEnabled: false,
        lastLoginAt: null,
        createdById: null,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
        isDeleted: false,
      });
      expect(sut.email.value).toBe('maria@example.com');
      expect(sut.canAccess()).toBe(true);
    });

    it('deve criar o ADMIN PENDING, registrando quem convidou (RN06)', () => {
      const sut = User.createAdmin({ ...input(), createdById: SUPER_ADMIN_ID });

      expect(sut).toMatchObject({
        role: Role.ADMIN,
        status: UserStatus.PENDING,
        emailVerifiedAt: null,
        createdById: SUPER_ADMIN_ID,
      });
      expect(sut.canAccess()).toBe(false);
    });

    it('deve criar o SUPER_ADMIN ACTIVE e com o e-mail verificado', () => {
      const sut = User.createSuperAdmin(input());

      expect(sut).toMatchObject({
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: NOW,
        createdById: null,
      });
    });

    it('deve remover os espaços das pontas do nome', () => {
      expect(User.createClient(input({ name: '  Maria da Silva ' })).name).toBe('Maria da Silva');
    });

    it.each(['', '   '])('deve rejeitar o nome vazio %p', (name) => {
      expect(() => User.createClient(input({ name }))).toThrow('O nome é obrigatório.');
    });

    it('deve rejeitar o nome com mais de 120 caracteres', () => {
      expect(() => User.createClient(input({ name: 'a'.repeat(121) }))).toThrow(
        InvalidUserNameError,
      );
      expect(User.createClient(input({ name: 'a'.repeat(120) })).name).toHaveLength(120);
    });

    it('deve reconstruir o usuário persistido sem alterar os dados', () => {
      const sut = restore({ status: UserStatus.INACTIVE, lastLoginAt: LATER });

      expect(sut).toMatchObject({ status: UserStatus.INACTIVE, lastLoginAt: LATER });
    });
  });

  describe('canAccess (RN09, RN10)', () => {
    it.each([UserStatus.PENDING, UserStatus.INACTIVE])('deve bloquear o usuário %p', (status) => {
      expect(restore({ status }).canAccess()).toBe(false);
    });

    it('deve bloquear o usuário excluído, mesmo ACTIVE', () => {
      expect(restore({ deletedAt: NOW }).canAccess()).toBe(false);
    });
  });

  describe('rename', () => {
    it('deve trocar o nome e atualizar o updatedAt', () => {
      const sut = restore();
      jest.setSystemTime(LATER);

      sut.rename(' Maria Souza ');

      expect(sut.name).toBe('Maria Souza');
      expect(sut.updatedAt).toEqual(LATER);
    });

    it('deve validar o novo nome', () => {
      expect(() => restore().rename(' ')).toThrow(InvalidUserNameError);
    });

    it('não deve renomear um usuário excluído', () => {
      expect(() => restore({ deletedAt: NOW }).rename('Outro')).toThrow(UserAlreadyDeletedError);
    });
  });

  describe('acceptInvitation (RN06)', () => {
    it('deve ativar o ADMIN PENDING e preencher o emailVerifiedAt', () => {
      const sut = User.createAdmin({ ...input(), createdById: SUPER_ADMIN_ID });
      jest.setSystemTime(LATER);

      sut.acceptInvitation();

      expect(sut).toMatchObject({
        status: UserStatus.ACTIVE,
        emailVerifiedAt: LATER,
        updatedAt: LATER,
      });
      expect(sut.canAccess()).toBe(true);
    });

    it.each([UserStatus.ACTIVE, UserStatus.INACTIVE])(
      'não deve aceitar o convite de um usuário %p',
      (status) => {
        const sut = restore({ role: Role.ADMIN, status });

        expect(() => sut.acceptInvitation()).toThrow(InvalidStatusTransitionError);
        expect(sut.status).toBe(status);
        expect(sut.emailVerifiedAt).toBeNull();
      },
    );
  });

  describe('deactivate e activate', () => {
    it.each([Role.ADMIN, Role.CLIENT])('deve inativar e reativar um %p', (role) => {
      const sut = restore({ role });

      sut.deactivate();
      expect(sut.status).toBe(UserStatus.INACTIVE);

      sut.activate();
      expect(sut.status).toBe(UserStatus.ACTIVE);
    });

    it('deve atualizar o updatedAt ao mudar o status', () => {
      const sut = restore();
      jest.setSystemTime(LATER);

      sut.deactivate();

      expect(sut.updatedAt).toEqual(LATER);
    });

    it.each([UserStatus.PENDING, UserStatus.INACTIVE])(
      'não deve inativar um usuário %p',
      (status) => {
        const sut = restore({ role: Role.ADMIN, status });

        expect(() => sut.deactivate()).toThrow(
          new InvalidStatusTransitionError(status, UserStatus.INACTIVE),
        );
      },
    );

    it.each([UserStatus.PENDING, UserStatus.ACTIVE])(
      'não deve reativar um usuário %p (o PENDING só ativa pelo convite)',
      (status) => {
        const sut = restore({ role: Role.ADMIN, status });

        expect(() => sut.activate()).toThrow(InvalidStatusTransitionError);
        expect(sut.status).toBe(status);
      },
    );

    it('não deve inativar o SUPER_ADMIN (RN03)', () => {
      const sut = User.createSuperAdmin(input());

      expect(() => sut.deactivate()).toThrow(SuperAdminProtectedError);
      expect(sut.status).toBe(UserStatus.ACTIVE);
    });

    it('não deve mudar o status de um usuário excluído', () => {
      expect(() => restore({ status: UserStatus.INACTIVE, deletedAt: NOW }).activate()).toThrow(
        UserAlreadyDeletedError,
      );
    });
  });

  describe('recordLogin', () => {
    it('deve registrar o horário do login', () => {
      const sut = restore();
      jest.setSystemTime(LATER);

      sut.recordLogin();

      expect(sut.lastLoginAt).toEqual(LATER);
    });
  });

  describe('delete (RN11)', () => {
    it('deve excluir o CLIENT e anonimizar o nome e o e-mail', () => {
      const sut = restore();
      jest.setSystemTime(LATER);

      sut.delete();

      expect(sut).toMatchObject({
        name: DELETED_USER_NAME,
        deletedAt: LATER,
        updatedAt: LATER,
        isDeleted: true,
      });
      expect(sut.email.value).toBe(`deleted+${USER_ID}@reportaai.invalid`);
      expect(sut.canAccess()).toBe(false);
    });

    it.each([UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.INACTIVE])(
      'deve excluir o ADMIN %p mantendo o nome para auditoria',
      (status) => {
        const sut = restore({ role: Role.ADMIN, status, name: 'Admin Fulano' });

        sut.delete();

        expect(sut.name).toBe('Admin Fulano');
        expect(sut.email.value).toBe(`deleted+${USER_ID}@reportaai.invalid`);
        expect(sut.isDeleted).toBe(true);
      },
    );

    it('não deve excluir o SUPER_ADMIN (RN03)', () => {
      const sut = User.createSuperAdmin(input());

      expect(() => sut.delete()).toThrow(SuperAdminProtectedError);
      expect(sut.isDeleted).toBe(false);
      expect(sut.email.value).toBe('maria@example.com');
    });

    it('não deve excluir duas vezes', () => {
      const sut = restore();
      sut.delete();

      expect(() => sut.delete()).toThrow(UserAlreadyDeletedError);
    });
  });
});
