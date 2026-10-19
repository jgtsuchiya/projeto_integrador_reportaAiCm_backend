import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';

import { Page, PageRequest } from '@shared/domain/pagination';

import { ClientProfile } from '../../../domain/entities/client-profile.entity';
import { UserToken } from '../../../domain/entities/user-token.entity';
import { User } from '../../../domain/entities/user.entity';
import { CpfAlreadyInUseError } from '../../../domain/errors/cpf-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import {
  ClientFilter,
  ClientWithProfile,
  UserFilter,
  UserRepository,
} from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email';
import { Role } from '../../../domain/value-objects/role';
import { ClientProfileOrmEntity } from '../entities/client-profile.orm-entity';
import { UserTokenOrmEntity } from '../entities/user-token.orm-entity';
import { UserOrmEntity } from '../entities/user.orm-entity';
import { ClientProfileMapper } from '../mappers/client-profile.mapper';
import { UserTokenMapper } from '../mappers/user-token.mapper';
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

  async findPage(filter: UserFilter, { page, pageSize }: PageRequest): Promise<Page<User>> {
    const where: FindOptionsWhere<UserOrmEntity> = { roleId: ROLE_IDS[filter.role] };
    if (filter.status) {
      where.status = filter.status;
    }

    const [entities, total] = await this.repository.findAndCount({
      where,
      // O id desempata os cadastros no mesmo milissegundo, para a paginação ser estável.
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items: entities.map((entity) => UserMapper.toDomain(entity)), page, pageSize, total };
  }

  async findClientPage(
    filter: ClientFilter,
    { page, pageSize }: PageRequest,
  ): Promise<Page<ClientWithProfile>> {
    // A consulta parte do perfil, que tem a relação com users. O CLIENT excluído perde o
    // perfil (RN11), então o INNER JOIN já o deixa de fora; a condição em deleted_at é reforço.
    const query = this.repository.manager
      .createQueryBuilder(ClientProfileOrmEntity, 'profile')
      .innerJoinAndSelect('profile.user', 'user')
      .where('user.roleId = :roleId', { roleId: ROLE_IDS[Role.CLIENT] })
      .andWhere('user.deletedAt IS NULL');

    if (filter.status) {
      query.andWhere('user.status = :status', { status: filter.status });
    }

    if (filter.cpf) {
      query.andWhere('profile.cpf = :cpf', { cpf: filter.cpf.value });
    }

    if (filter.text) {
      // A collation do banco (utf8mb4_0900_ai_ci) ignora maiúsculas e acentos no LIKE.
      const text = `%${escapeLike(filter.text)}%`;
      query.andWhere(
        new Brackets((where) => {
          where.where('user.name LIKE :text', { text }).orWhere('user.email LIKE :text', { text });
        }),
      );
    }

    const [profiles, total] = await query
      // O id desempata os cadastros no mesmo milissegundo, para a paginação ser estável.
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getManyAndCount();

    const items = profiles.map((entity) => ({
      user: UserMapper.toDomain(entity.user as UserOrmEntity),
      profile: ClientProfileMapper.toDomain(entity),
    }));

    return { items, page, pageSize, total };
  }

  async save(user: User): Promise<void> {
    await this.repository.save(UserMapper.toPersistence(user));
  }

  async saveClient(user: User, profile: ClientProfile, token: UserToken): Promise<void> {
    try {
      await this.repository.manager.transaction(async (manager) => {
        // O perfil e o token referenciam o usuário (FK), então o usuário é gravado primeiro.
        await manager.insert(UserOrmEntity, UserMapper.toPersistence(user));
        await manager.insert(ClientProfileOrmEntity, ClientProfileMapper.toPersistence(profile));
        await manager.insert(UserTokenOrmEntity, UserTokenMapper.toPersistence(token));
      });
    } catch (error) {
      throw toUniqueConstraintError(error) ?? error;
    }
  }

  async updateClient(user: User, profile: ClientProfile): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager.save(UserMapper.toPersistence(user));
      await manager.save(ClientProfileMapper.toPersistence(profile));
    });
  }

  async deleteClient(user: User): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager.save(UserMapper.toPersistence(user));
      await manager.delete(ClientProfileOrmEntity, { userId: user.id });
    });
  }

  async saveWithToken(user: User, token: UserToken): Promise<void> {
    try {
      await this.repository.manager.transaction(async (manager) => {
        // O token referencia o usuário (FK), então o usuário é gravado primeiro.
        await manager.save(UserMapper.toPersistence(user));
        await manager.save(UserTokenMapper.toPersistence(token));
      });
    } catch (error) {
      throw toUniqueConstraintError(error) ?? error;
    }
  }
}

/** Escapa os curingas do LIKE (`%` e `_`), para o texto da busca valer literalmente. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
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
