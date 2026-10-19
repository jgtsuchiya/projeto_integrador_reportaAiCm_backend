import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';

import { LoginAttempt } from '../../../domain/entities/login-attempt.entity';
import { LoginAttemptRepository } from '../../../domain/repositories/login-attempt.repository';
import { Email } from '../../../domain/value-objects/email';
import { LoginAttemptOrmEntity } from '../entities/login-attempt.orm-entity';
import { LoginAttemptMapper } from '../mappers/login-attempt.mapper';

/** As consultas por e-mail e data usam o índice (`email`, `created_at`). */
@Injectable()
export class TypeOrmLoginAttemptRepository implements LoginAttemptRepository {
  constructor(
    @InjectRepository(LoginAttemptOrmEntity)
    private readonly repository: Repository<LoginAttemptOrmEntity>,
  ) {}

  async save(attempt: LoginAttempt): Promise<void> {
    await this.repository.insert(LoginAttemptMapper.toPersistence(attempt));
  }

  async countRecentFailures(email: Email, since: Date): Promise<number> {
    const lastSuccess = await this.repository.findOne({
      select: { createdAt: true },
      where: { email: email.value, succeeded: true, createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
    });

    return this.repository.countBy({
      email: email.value,
      succeeded: false,
      createdAt: MoreThan(lastSuccess?.createdAt ?? since),
    });
  }

  async deleteFailuresSince(email: Email, since: Date): Promise<void> {
    await this.repository.delete({
      email: email.value,
      succeeded: false,
      createdAt: MoreThan(since),
    });
  }

  async deleteByEmail(email: Email): Promise<void> {
    await this.repository.delete({ email: email.value });
  }

  async deleteOlderThan(date: Date): Promise<void> {
    await this.repository.delete({ createdAt: LessThan(date) });
  }
}
