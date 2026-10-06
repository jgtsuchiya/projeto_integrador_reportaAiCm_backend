import { LoginAttempt } from '../../../domain/entities/login-attempt.entity';
import { Email } from '../../../domain/value-objects/email';
import { LoginAttemptOrmEntity } from '../entities/login-attempt.orm-entity';
import { LoginAttemptMapper } from './login-attempt.mapper';

describe('LoginAttemptMapper', () => {
  it('deve converter a tentativa em entidade ORM, com o e-mail em texto', () => {
    const attempt = LoginAttempt.record({
      email: Email.create('maria@example.com'),
      ipAddress: '2001:db8:85a3::8a2e:370:7334',
      userAgent: 'Mozilla/5.0 (Linux; Android 16)',
      succeeded: true,
    });

    const result = LoginAttemptMapper.toPersistence(attempt);

    expect(result).toBeInstanceOf(LoginAttemptOrmEntity);
    expect(result).toEqual({
      id: attempt.id,
      email: 'maria@example.com',
      ipAddress: '2001:db8:85a3::8a2e:370:7334',
      userAgent: 'Mozilla/5.0 (Linux; Android 16)',
      succeeded: true,
      createdAt: attempt.createdAt,
    });
  });

  it('deve manter nulos o IP e o user agent ausentes', () => {
    const attempt = LoginAttempt.record({
      email: Email.create('maria@example.com'),
      ipAddress: null,
      userAgent: null,
      succeeded: false,
    });

    const result = LoginAttemptMapper.toPersistence(attempt);

    expect(result).toMatchObject({ ipAddress: null, userAgent: null, succeeded: false });
  });
});
