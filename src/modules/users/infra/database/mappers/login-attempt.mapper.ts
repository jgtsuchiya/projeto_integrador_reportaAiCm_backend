import { LoginAttempt } from '../../../domain/entities/login-attempt.entity';
import { LoginAttemptOrmEntity } from '../entities/login-attempt.orm-entity';

/** Só existe o caminho de ida: a tentativa é gravada e contada, mas nunca reconstruída. */
export class LoginAttemptMapper {
  static toPersistence(attempt: LoginAttempt): LoginAttemptOrmEntity {
    const entity = new LoginAttemptOrmEntity();
    entity.id = attempt.id;
    entity.email = attempt.email.value;
    entity.ipAddress = attempt.ipAddress;
    entity.userAgent = attempt.userAgent;
    entity.succeeded = attempt.succeeded;
    entity.createdAt = attempt.createdAt;

    return entity;
  }
}
