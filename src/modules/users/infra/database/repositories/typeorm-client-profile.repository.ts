import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ClientProfile } from '../../../domain/entities/client-profile.entity';
import { ClientProfileRepository } from '../../../domain/repositories/client-profile.repository';
import { Cpf } from '../../../domain/value-objects/cpf';
import { ClientProfileOrmEntity } from '../entities/client-profile.orm-entity';
import { ClientProfileMapper } from '../mappers/client-profile.mapper';

@Injectable()
export class TypeOrmClientProfileRepository implements ClientProfileRepository {
  constructor(
    @InjectRepository(ClientProfileOrmEntity)
    private readonly repository: Repository<ClientProfileOrmEntity>,
  ) {}

  async findByUserId(userId: string): Promise<ClientProfile | null> {
    const entity = await this.repository.findOneBy({ userId });

    return entity ? ClientProfileMapper.toDomain(entity) : null;
  }

  async existsByCpf(cpf: Cpf): Promise<boolean> {
    return this.repository.existsBy({ cpf: cpf.value });
  }

  async save(profile: ClientProfile): Promise<void> {
    await this.repository.save(ClientProfileMapper.toPersistence(profile));
  }

  async delete(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }
}
