import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { ClientProfile } from '../../../domain/entities/client-profile.entity';
import { User } from '../../../domain/entities/user.entity';
import { CpfAlreadyInUseError } from '../../../domain/errors/cpf-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { UserRepository } from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email';
import { Role } from '../../../domain/value-objects/role';
import { ClientProfileOrmEntity } from '../entities/client-profile.orm-entity';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { ClientProfileMapper } from '../mappers/client-profile.mapper';
import { ROLE_IDS, UserMapper } from '../mappers/user.mapper';

/** Erros de domínio para cada restrição UNIQUE, pelo nome dado nas entidades ORM. */
const UNIQUE_CONSTRAINT_ERRORS: ReadonlyArray<[string, () => Error]> = [
  ['uq_users_email', () => new EmailAlreadyInUseError()],
  ['uq_client_profiles_cpf', () => new CpfAlreadyInUseError()],
];

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

  async saveClient(user: User, profile: ClientProfile): Promise<void> {
    try {
      await this.repository.manager.transaction(async (manager) => {
        await manager.insert(UserOrmEntity, UserMapper.toPersistence(user));
        await manager.insert(ClientProfileOrmEntity, ClientProfileMapper.toPersistence(profile));
      });
    } catch (error) {
      throw toUniqueConstraintError(error) ?? error;
    }
  }
}

/**
 * O caso de uso confere e-mail e CPF antes de gravar, mas dois cadastros simultâneos podem
 * passar pela verificação. Nesse caso, quem barra é o índice UNIQUE do MySQL.
 */
function toUniqueConstraintError(error: unknown): Error | null {
  if (!(error instanceof QueryFailedError)) {
    return null;
  }

  const { code, sqlMessage } = error.driverError as { code?: string; sqlMessage?: string };
  if (code !== 'ER_DUP_ENTRY' || !sqlMessage) {
    return null;
  }

  const match = UNIQUE_CONSTRAINT_ERRORS.find(([constraint]) => sqlMessage.includes(constraint));

  return match ? match[1]() : null;
}
