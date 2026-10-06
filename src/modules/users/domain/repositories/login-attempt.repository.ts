import { LoginAttempt } from '../entities/login-attempt.entity';
import { Email } from '../value-objects/email';

export abstract class LoginAttemptRepository {
  abstract save(attempt: LoginAttempt): Promise<void>;
  /**
   * Conta as falhas do e-mail que valem para o bloqueio (RN17): as registradas depois de
   * `since` e depois do último login com sucesso.
   */
  abstract countRecentFailures(email: Email, since: Date): Promise<number>;
  /**
   * Apaga as falhas do e-mail registradas depois de `since`. É assim que o bloqueio é zerado:
   * as falhas mais antigas já não entram na conta.
   */
  abstract deleteFailuresSince(email: Email, since: Date): Promise<void>;
  /** Apaga todas as tentativas do e-mail, junto com a conta excluída (RN11, RN19). */
  abstract deleteByEmail(email: Email): Promise<void>;
  /** Apaga as tentativas registradas antes de `date`, que passaram do prazo de retenção (RN19). */
  abstract deleteOlderThan(date: Date): Promise<void>;
}
