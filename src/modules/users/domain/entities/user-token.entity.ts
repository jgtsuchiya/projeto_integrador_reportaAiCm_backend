import { createHash, randomBytes } from 'node:crypto';

import { Entity } from '@shared/domain/entity';

import { InvalidUserTokenError } from '../errors/invalid-user-token.error';
import { UserTokenType } from '../value-objects/user-token-type';

/** 256 bits aleatórios. Em base64url, viram 43 caracteres que vão direto na URL. */
const SECRET_BYTES = 32;
const HOUR_IN_MS = 60 * 60 * 1000;

export interface UserTokenProps {
  userId: string;
  type: UserTokenType;
  /** SHA-256 do segredo, em hexadecimal. */
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface IssueUserTokenInput {
  userId: string;
  type: UserTokenType;
  validForHours: number;
}

/** Token recém-emitido. O `secret` só existe em memória: vai no link do e-mail e nunca é salvo. */
export interface IssuedUserToken {
  token: UserToken;
  secret: string;
}

/**
 * Token de uso único enviado por e-mail, como o convite do ADMIN (RN06).
 *
 * Só o hash do segredo é guardado, então quem lê o banco não consegue montar um link válido.
 * O link recebido é conferido calculando o hash de novo (`UserToken.hash`).
 */
export class UserToken extends Entity {
  private constructor(
    id: string | undefined,
    private readonly props: UserTokenProps,
  ) {
    super(id);
  }

  static issue(input: IssueUserTokenInput): IssuedUserToken {
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const now = new Date();

    const token = new UserToken(undefined, {
      userId: input.userId,
      type: input.type,
      tokenHash: UserToken.hash(secret),
      expiresAt: new Date(now.getTime() + input.validForHours * HOUR_IN_MS),
      usedAt: null,
      createdAt: now,
    });

    return { token, secret };
  }

  /** Reconstrói um token já persistido, sem validar nem alterar os dados. */
  static restore(id: string, props: UserTokenProps): UserToken {
    return new UserToken(id, { ...props });
  }

  /** Hash gravado no banco, usado também para buscar o token recebido no link. */
  static hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  get userId(): string {
    return this.props.userId;
  }

  get type(): UserTokenType {
    return this.props.type;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** O token ainda não foi usado e está dentro da validade. */
  isUsable(now: Date = new Date()): boolean {
    return this.props.usedAt === null && now < this.props.expiresAt;
  }

  /** Marca o token como usado. Lança `InvalidUserTokenError` se ele já foi usado ou expirou. */
  use(now: Date = new Date()): void {
    if (!this.isUsable(now)) {
      throw new InvalidUserTokenError();
    }

    this.props.usedAt = now;
  }
}
