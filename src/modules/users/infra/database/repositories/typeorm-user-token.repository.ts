import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';

import { LOGIN_CODE_MAX_ATTEMPTS, UserToken } from '../../../domain/entities/user-token.entity';
import { UserTokenRepository } from '../../../domain/repositories/user-token.repository';
import { UserTokenType } from '../../../domain/value-objects/user-token-type';
import { UserTokenOrmEntity } from '../entities/user-token.orm-entity';
import { UserTokenMapper } from '../mappers/user-token.mapper';

@Injectable()
export class TypeOrmUserTokenRepository implements UserTokenRepository {
  constructor(
    @InjectRepository(UserTokenOrmEntity)
    private readonly repository: Repository<UserTokenOrmEntity>,
  ) {}

  async findByHash(tokenHash: string): Promise<UserToken | null> {
    const entity = await this.repository.findOneBy({ tokenHash });

    return entity ? UserTokenMapper.toDomain(entity) : null;
  }

  async findLatest(userId: string, type: UserTokenType): Promise<UserToken | null> {
    const entity = await this.repository.findOne({
      where: { userId, type },
      order: { createdAt: 'DESC' },
    });

    return entity ? UserTokenMapper.toDomain(entity) : null;
  }

  async replace(token: UserToken): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager.delete(UserTokenOrmEntity, { userId: token.userId, type: token.type });
      await manager.insert(UserTokenOrmEntity, UserTokenMapper.toPersistence(token));
    });
  }

  async saveFailedAttempt(token: UserToken): Promise<void> {
    // Um UPDATE só (`attempts = attempts + 1`), que o banco aplica em fila para a mesma linha.
    await this.repository.increment(
      { id: token.id, attempts: LessThan(LOGIN_CODE_MAX_ATTEMPTS) },
      'attempts',
      1,
    );
  }

  async consume(token: UserToken): Promise<boolean> {
    const result = await this.repository.update(
      { id: token.id, usedAt: IsNull(), attempts: LessThan(LOGIN_CODE_MAX_ATTEMPTS) },
      { usedAt: token.usedAt },
    );

    return result.affected === 1;
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }
}
