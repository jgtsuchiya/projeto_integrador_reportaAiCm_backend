import { Injectable } from '@nestjs/common';

import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { LoginAttemptRepository } from '../../domain/repositories/login-attempt.repository';
import { Email } from '../../domain/value-objects/email';

const MINUTE_IN_MS = 60 * 1000;

/**
 * Configuração do bloqueio do login, lida das variáveis de ambiente pelo UsersModule. Fica
 * numa classe própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class LoginLockConfig {
  /** `LOGIN_MAX_FAILED_ATTEMPTS`. */
  abstract readonly maxFailedAttempts: number;
  /** `LOGIN_LOCK_WINDOW_MINUTES`. */
  abstract readonly windowMinutes: number;
}

/**
 * E-mail informado no login, normalizado. Retorna null quando ele não segue as regras do
 * `Email` (o SuperTokens aceita endereços que a aplicação recusa, como os de mais de 254
 * caracteres). Toda conta é criada com um `Email` válido, então esse endereço não tem conta:
 * ele fica fora do bloqueio e do registro, e o login responde só a credencial inválida.
 */
export function parseLoginEmail(raw: string): Email | null {
  try {
    return Email.create(raw);
  } catch (error) {
    if (error instanceof InvalidEmailError) {
      return null;
    }

    throw error;
  }
}

/**
 * Bloqueio temporário do login por e-mail (RN17): com `maxFailedAttempts` falhas na janela,
 * contadas desde o último login com sucesso, o e-mail fica bloqueado até uma delas sair da
 * janela. A conta é pelo e-mail informado, com conta ou não.
 */
@Injectable()
export class LoginLockService {
  constructor(
    private readonly loginAttemptRepository: LoginAttemptRepository,
    private readonly config: LoginLockConfig,
  ) {}

  async isLocked(email: Email): Promise<boolean> {
    const failures = await this.loginAttemptRepository.countRecentFailures(
      email,
      this.windowStart(),
    );

    return failures >= this.config.maxFailedAttempts;
  }

  /**
   * Zera o bloqueio do e-mail, apagando as falhas que estão na conta. Usado quando o usuário
   * prova a posse do e-mail por outro caminho, como a redefinição de senha (RN21).
   */
  async clear(email: Email): Promise<void> {
    await this.loginAttemptRepository.deleteFailuresSince(email, this.windowStart());
  }

  private windowStart(): Date {
    return new Date(Date.now() - this.config.windowMinutes * MINUTE_IN_MS);
  }
}
