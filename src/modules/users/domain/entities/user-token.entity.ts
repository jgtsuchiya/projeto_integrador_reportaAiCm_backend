import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { Entity } from '@shared/domain/entity';

import { InvalidUserTokenError } from '../errors/invalid-user-token.error';
import { UserLinkTokenType, UserTokenType } from '../value-objects/user-token-type';

/** 256 bits aleatórios. Em base64url, viram 43 caracteres que vão direto na URL. */
const SECRET_BYTES = 32;
const MINUTE_IN_MS = 60 * 1000;

export const LOGIN_CODE_LENGTH = 6;

/** Erros na conferência que invalidam o código da segunda etapa (RN25). */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export interface UserTokenProps {
  userId: string;
  type: UserTokenType;
  /** SHA-256 do segredo, em hexadecimal. No código, o id do usuário entra no hash. */
  tokenHash: string;
  /** Erros na conferência do código. Só o `LOGIN_CODE` usa. */
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface IssueUserTokenInput {
  userId: string;
  type: UserLinkTokenType;
  validForMinutes: number;
}

interface IssueLoginCodeInput {
  userId: string;
  validForMinutes: number;
}

/**
 * Token recém-emitido. O `secret` só existe em memória: vai no e-mail (no link, ou é o próprio
 * código) e nunca é salvo.
 */
export interface IssuedUserToken {
  token: UserToken;
  secret: string;
}

/**
 * Token de uso único enviado por e-mail. Tem dois formatos:
 *
 * - **link** (convite, redefinição de senha e verificação de e-mail): um segredo de 256 bits,
 *   que vai na URL. O token é localizado pelo hash do segredo (`UserToken.hash`);
 * - **código** (segunda etapa do login): 6 dígitos, que o usuário digita. O token é localizado
 *   pelo usuário e pelo tipo, e o código é conferido com `matchesCode`.
 *
 * Só o hash é guardado, então quem lê o banco não consegue montar um link válido.
 */
export class UserToken extends Entity {
  private constructor(
    id: string | undefined,
    private readonly props: UserTokenProps,
  ) {
    super(id);
  }

  /** Emite um token de link. */
  static issue(input: IssueUserTokenInput): IssuedUserToken {
    const secret = randomBytes(SECRET_BYTES).toString('base64url');

    return { token: UserToken.create(input, UserToken.hash(secret)), secret };
  }

  /**
   * Emite o código da segunda etapa do login (RN25). Com só um milhão de valores, ele depende
   * da validade curta e do limite de erros (`registerFailedAttempt`).
   */
  static issueCode(input: IssueLoginCodeInput): IssuedUserToken {
    const code = randomInt(10 ** LOGIN_CODE_LENGTH)
      .toString()
      .padStart(LOGIN_CODE_LENGTH, '0');
    const token = UserToken.create(
      { ...input, type: UserTokenType.LOGIN_CODE },
      UserToken.hashCode(input.userId, code),
    );

    return { token, secret: code };
  }

  /** Reconstrói um token já persistido, sem validar nem alterar os dados. */
  static restore(id: string, props: UserTokenProps): UserToken {
    return new UserToken(id, { ...props });
  }

  /** Hash gravado no banco, usado também para buscar o token recebido no link. */
  static hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Hash do código de 6 dígitos. O id do usuário entra na conta porque o `token_hash` é
   * UNIQUE, e dois usuários podem receber o mesmo código ao mesmo tempo.
   */
  static hashCode(userId: string, code: string): string {
    return UserToken.hash(`${userId}:${code}`);
  }

  private static create(
    input: { userId: string; type: UserTokenType; validForMinutes: number },
    tokenHash: string,
  ): UserToken {
    const now = new Date();

    return new UserToken(undefined, {
      userId: input.userId,
      type: input.type,
      tokenHash,
      attempts: 0,
      expiresAt: new Date(now.getTime() + input.validForMinutes * MINUTE_IN_MS),
      usedAt: null,
      createdAt: now,
    });
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

  get attempts(): number {
    return this.props.attempts;
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

  /** O token ainda não foi usado, está dentro da validade e não atingiu o limite de erros. */
  isUsable(now: Date = new Date()): boolean {
    return (
      this.props.usedAt === null &&
      now < this.props.expiresAt &&
      this.props.attempts < LOGIN_CODE_MAX_ATTEMPTS
    );
  }

  /**
   * Confere o código digitado com o hash gravado. Não diz se o token ainda vale: um código
   * certo depois do 5º erro continua recusado pelo `isUsable`.
   */
  matchesCode(code: string): boolean {
    const expected = Buffer.from(this.props.tokenHash, 'hex');
    const received = Buffer.from(UserToken.hashCode(this.props.userId, code), 'hex');

    // Comparação em tempo constante, para o tempo de resposta não dar pista do hash.
    return timingSafeEqual(expected, received);
  }

  /** Conta um erro na conferência do código. No 5º, o código deixa de valer (RN25). */
  registerFailedAttempt(): void {
    if (this.props.attempts < LOGIN_CODE_MAX_ATTEMPTS) {
      this.props.attempts += 1;
    }
  }

  /**
   * Marca o token como usado. Lança `InvalidUserTokenError` se ele já foi usado, expirou ou
   * atingiu o limite de erros.
   */
  use(now: Date = new Date()): void {
    if (!this.isUsable(now)) {
      throw new InvalidUserTokenError();
    }

    this.props.usedAt = now;
  }
}
