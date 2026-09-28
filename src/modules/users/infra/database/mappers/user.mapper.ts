import { User } from '../../../domain/entities/user.entity';
import { Email } from '../../../domain/value-objects/email';
import { Role } from '../../../domain/value-objects/role';
import { UserOrmEntity } from '../entities/user.orm-entity';

/** Ids fixos da tabela `roles`, carregados pela migration CreateUsersTables. */
export const ROLE_IDS: Readonly<Record<Role, number>> = {
  [Role.SUPER_ADMIN]: 1,
  [Role.ADMIN]: 2,
  [Role.CLIENT]: 3,
};

function roleFromId(roleId: number): Role {
  const role = (Object.keys(ROLE_IDS) as Role[]).find((code) => ROLE_IDS[code] === roleId);

  if (!role) {
    throw new Error(`role_id desconhecido: ${roleId}.`);
  }

  return role;
}

export class UserMapper {
  static toDomain(entity: UserOrmEntity): User {
    return User.restore(entity.id, {
      role: roleFromId(entity.roleId),
      name: entity.name,
      email: Email.create(entity.email),
      status: entity.status,
      emailVerifiedAt: entity.emailVerifiedAt,
      mfaEnabled: entity.mfaEnabled,
      lastLoginAt: entity.lastLoginAt,
      createdById: entity.createdById,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    });
  }

  static toPersistence(user: User): UserOrmEntity {
    const entity = new UserOrmEntity();
    entity.id = user.id;
    entity.roleId = ROLE_IDS[user.role];
    entity.name = user.name;
    entity.email = user.email.value;
    entity.status = user.status;
    entity.emailVerifiedAt = user.emailVerifiedAt;
    entity.mfaEnabled = user.mfaEnabled;
    entity.lastLoginAt = user.lastLoginAt;
    entity.createdById = user.createdById;
    entity.createdAt = user.createdAt;
    entity.updatedAt = user.updatedAt;
    entity.deletedAt = user.deletedAt;

    return entity;
  }
}
