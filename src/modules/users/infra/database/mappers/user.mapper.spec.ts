import { User } from '../../../domain/entities/user.entity';
import { Email } from '../../../domain/value-objects/email';
import { Role } from '../../../domain/value-objects/role';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { ROLE_IDS, UserMapper } from './user.mapper';

function buildOrmEntity(overrides: Partial<UserOrmEntity> = {}): UserOrmEntity {
  return Object.assign(new UserOrmEntity(), {
    id: '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b',
    roleId: 2,
    name: 'Admin Fulano',
    email: 'admin@example.com',
    status: 'ACTIVE',
    emailVerifiedAt: new Date('2026-09-20T10:00:00.000Z'),
    mfaEnabled: false,
    lastLoginAt: new Date('2026-09-27T09:00:00.000Z'),
    createdById: '0b7e4c2a-1d3f-4e5a-8b6c-9d0e1f2a3b4c',
    createdAt: new Date('2026-09-19T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  });
}

describe('UserMapper', () => {
  it('deve usar os mesmos ids da tabela roles', () => {
    expect(ROLE_IDS).toEqual({ SUPER_ADMIN: 1, ADMIN: 2, CLIENT: 3 });
  });

  it('deve converter a entidade ORM em entidade de domínio', () => {
    const entity = buildOrmEntity();

    const user = UserMapper.toDomain(entity);

    expect(user).toBeInstanceOf(User);
    expect(user.id).toBe(entity.id);
    expect(user).toMatchObject({
      role: Role.ADMIN,
      name: entity.name,
      status: entity.status,
      emailVerifiedAt: entity.emailVerifiedAt,
      mfaEnabled: false,
      lastLoginAt: entity.lastLoginAt,
      createdById: entity.createdById,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: null,
    });
    expect(user.email.value).toBe(entity.email);
  });

  it.each([
    [1, Role.SUPER_ADMIN],
    [2, Role.ADMIN],
    [3, Role.CLIENT],
  ])('deve converter o role_id %p em %p', (roleId, role) => {
    expect(UserMapper.toDomain(buildOrmEntity({ roleId })).role).toBe(role);
  });

  it('deve falhar com um role_id desconhecido', () => {
    expect(() => UserMapper.toDomain(buildOrmEntity({ roleId: 99 }))).toThrow(
      'role_id desconhecido: 99.',
    );
  });

  it('deve fazer o caminho de volta sem perder dados', () => {
    const entity = buildOrmEntity();

    expect(UserMapper.toPersistence(UserMapper.toDomain(entity))).toEqual(entity);
  });

  it('deve levar a exclusão lógica para a persistência', () => {
    const user = User.createClient({
      id: '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b',
      name: 'Maria da Silva',
      email: Email.create('maria@example.com'),
    });
    user.delete();

    const entity = UserMapper.toPersistence(user);

    expect(entity).toBeInstanceOf(UserOrmEntity);
    expect(entity).toMatchObject({
      roleId: 3,
      email: user.email.value,
      name: user.name,
      deletedAt: user.deletedAt,
    });
    expect(entity.deletedAt).toBeInstanceOf(Date);
  });
});
