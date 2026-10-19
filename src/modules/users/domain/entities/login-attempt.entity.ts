import { isIP } from 'node:net';

import { Entity } from '@shared/domain/entity';

import { Email } from '../value-objects/email';

/** Tamanho da coluna `ip_address`, onde cabe um IPv6. */
export const LOGIN_ATTEMPT_IP_MAX_LENGTH = 45;

export const LOGIN_ATTEMPT_USER_AGENT_MAX_LENGTH = 255;

/** Prazo de retenção das tentativas, que guardam dado pessoal (RN19). */
export const LOGIN_ATTEMPT_RETENTION_DAYS = 30;

export interface LoginAttemptProps {
  /** E-mail informado no login. Pode não ter conta. */
  email: Email;
  ipAddress: string | null;
  userAgent: string | null;
  succeeded: boolean;
  createdAt: Date;
}

interface RecordLoginAttemptInput {
  email: Email;
  ipAddress: string | null;
  userAgent: string | null;
  succeeded: boolean;
}

/**
 * Tentativa de login já respondida (RN19). É a base do bloqueio por e-mail (RN17) e fica
 * guardada como registro, sem ser alterada depois.
 *
 * A senha não faz parte da tentativa: só o e-mail, a origem da requisição e o resultado.
 */
export class LoginAttempt extends Entity {
  private constructor(private readonly props: LoginAttemptProps) {
    super();
  }

  /**
   * O IP e o user agent vêm da requisição, então são ajustados ao que a tabela aceita: o user
   * agent é cortado, e um IP que não é um endereço válido não é guardado.
   */
  static record(input: RecordLoginAttemptInput): LoginAttempt {
    return new LoginAttempt({
      email: input.email,
      ipAddress: LoginAttempt.normalizeIp(input.ipAddress),
      userAgent: input.userAgent?.slice(0, LOGIN_ATTEMPT_USER_AGENT_MAX_LENGTH) || null,
      succeeded: input.succeeded,
      createdAt: new Date(),
    });
  }

  private static normalizeIp(ipAddress: string | null): string | null {
    if (!ipAddress || ipAddress.length > LOGIN_ATTEMPT_IP_MAX_LENGTH || isIP(ipAddress) === 0) {
      return null;
    }

    return ipAddress;
  }

  get email(): Email {
    return this.props.email;
  }

  get ipAddress(): string | null {
    return this.props.ipAddress;
  }

  get userAgent(): string | null {
    return this.props.userAgent;
  }

  get succeeded(): boolean {
    return this.props.succeeded;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
