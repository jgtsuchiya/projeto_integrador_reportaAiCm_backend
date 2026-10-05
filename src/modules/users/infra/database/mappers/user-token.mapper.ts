import { UserToken } from '../../../domain/entities/user-token.entity';
import { UserTokenOrmEntity } from '../entities/user-token.orm-entity';

export class UserTokenMapper {
  static toDomain(entity: UserTokenOrmEntity): UserToken {
    return UserToken.restore(entity.id, {
      userId: entity.userId,
      type: entity.type,
      tokenHash: entity.tokenHash,
      attempts: entity.attempts,
      expiresAt: entity.expiresAt,
      usedAt: entity.usedAt,
      createdAt: entity.createdAt,
    });
  }

  static toPersistence(token: UserToken): UserTokenOrmEntity {
    const entity = new UserTokenOrmEntity();
    entity.id = token.id;
    entity.userId = token.userId;
    entity.type = token.type;
    entity.tokenHash = token.tokenHash;
    entity.attempts = token.attempts;
    entity.expiresAt = token.expiresAt;
    entity.usedAt = token.usedAt;
    entity.createdAt = token.createdAt;

    return entity;
  }
}
