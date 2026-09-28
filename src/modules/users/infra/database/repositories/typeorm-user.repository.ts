import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../../domain/entities/user.entity';
import { UserRepository } from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email';
import { Role } from '../../../domain/value-objects/role';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { ROLE_IDS, UserMapper } from '../mappers/user.mapper';

/** As consultas do TypeORM já ignoram as linhas com `deleted_at` (`@DeleteDateColumn`). */
@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const entity = await this.repository.findOneBy({ id });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const entity = await this.repository.findOneBy({ email: email.value });

    return entity ? UserMapper.toDomain(entity) : null;
  }

  async existsByEmail(email: Email): Promise<boolean> {
    return this.repository.existsBy({ email: email.value });
  }

  async existsByRole(role: Role): Promise<boolean> {
    return this.repository.existsBy({ roleId: ROLE_IDS[role] });
  }

  async save(user: User): Promise<void> {
    await this.repository.save(UserMapper.toPersistence(user));
  }
}
