import { UserToken } from '../../../domain/entities/user-token.entity';
import { UserTokenOrmEntity } from '../entities/user-token.orm-entity';
import { UserTokenMapper } from './user-token.mapper';

describe('UserTokenMapper', () => {
  const entity = Object.assign(new UserTokenOrmEntity(), {
    id: '0b6c1a4e-2f3d-4c5b-8a9e-1f2d3c4b5a6e',
    userId: '5d1c1f0e-8a3b-4f6e-9c2d-7b8a9e0f1a2b',
    type: 'LOGIN_CODE' as const,
    tokenHash: 'f'.repeat(64),
    attempts: 3,
    expiresAt: new Date('2026-09-30T12:00:00.000Z'),
    usedAt: new Date('2026-09-29T08:00:00.000Z'),
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
  });

  it('deve converter a entidade ORM em entidade de domínio', () => {
    const token = UserTokenMapper.toDomain(entity);

    expect(token).toBeInstanceOf(UserToken);
    expect(token.id).toBe(entity.id);
    expect(token.userId).toBe(entity.userId);
    expect(token.type).toBe(entity.type);
    expect(token.tokenHash).toBe(entity.tokenHash);
    expect(token.attempts).toBe(entity.attempts);
    expect(token.expiresAt).toBe(entity.expiresAt);
    expect(token.usedAt).toBe(entity.usedAt);
    expect(token.createdAt).toBe(entity.createdAt);
  });

  it('deve fazer o caminho de volta sem perder dados', () => {
    const result = UserTokenMapper.toPersistence(UserTokenMapper.toDomain(entity));

    expect(result).toBeInstanceOf(UserTokenOrmEntity);
    expect(result).toEqual(entity);
  });
});
