import { ClientProfile } from '../../../domain/entities/client-profile.entity';
import { BirthDate } from '../../../domain/value-objects/birth-date';
import { Cpf } from '../../../domain/value-objects/cpf';
import { Phone } from '../../../domain/value-objects/phone';
import { ClientProfileOrmEntity } from '../entities/client-profile.orm-entity';

export class ClientProfileMapper {
  static toDomain(entity: ClientProfileOrmEntity): ClientProfile {
    return ClientProfile.restore(entity.userId, {
      cpf: Cpf.create(entity.cpf),
      phone: Phone.create(entity.phone),
      birthDate: BirthDate.create(entity.birthDate),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toPersistence(profile: ClientProfile): ClientProfileOrmEntity {
    const entity = new ClientProfileOrmEntity();
    entity.userId = profile.userId;
    entity.cpf = profile.cpf.value;
    entity.phone = profile.phone.value;
    entity.birthDate = profile.birthDate.value;
    entity.createdAt = profile.createdAt;
    entity.updatedAt = profile.updatedAt;

    return entity;
  }
}
