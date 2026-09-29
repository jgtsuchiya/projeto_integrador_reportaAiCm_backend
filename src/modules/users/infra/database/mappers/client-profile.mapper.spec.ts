import { ClientProfile } from '../../../domain/entities/client-profile.entity';
import { ClientProfileOrmEntity } from '../entities/client-profile.orm-entity';
import { ClientProfileMapper } from './client-profile.mapper';

describe('ClientProfileMapper', () => {
  const entity = Object.assign(new ClientProfileOrmEntity(), {
    userId: '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b',
    cpf: '52998224725',
    phone: '43999998888',
    birthDate: '1990-05-20',
    createdAt: new Date('2026-09-19T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
  });

  it('deve converter a entidade ORM em entidade de domínio', () => {
    const profile = ClientProfileMapper.toDomain(entity);

    expect(profile).toBeInstanceOf(ClientProfile);
    expect(profile.userId).toBe(entity.userId);
    expect(profile.cpf.value).toBe(entity.cpf);
    expect(profile.phone.value).toBe(entity.phone);
    expect(profile.birthDate.value).toBe(entity.birthDate);
    expect(profile.createdAt).toBe(entity.createdAt);
    expect(profile.updatedAt).toBe(entity.updatedAt);
  });

  it('deve fazer o caminho de volta sem perder dados', () => {
    const result = ClientProfileMapper.toPersistence(ClientProfileMapper.toDomain(entity));

    expect(result).toBeInstanceOf(ClientProfileOrmEntity);
    expect(result).toEqual(entity);
  });
});
