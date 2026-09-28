import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserToken } from '../../../domain/entities/user-token.entity';
import { UserTokenRepository } from '../../../domain/repositories/user-token.repository';
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

  async replace(token: UserToken): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager.delete(UserTokenOrmEntity, { userId: token.userId, type: token.type });
      await manager.insert(UserTokenOrmEntity, UserTokenMapper.toPersistence(token));
    });
  }
}
