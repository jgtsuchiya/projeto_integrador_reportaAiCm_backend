import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserToken } from '../../domain/entities/user-token.entity';
import { InvalidUserTokenError } from '../../domain/errors/invalid-user-token.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { Password } from '../../domain/value-objects/password';
import { UserStatus } from '../../domain/value-objects/user-status';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { IdentityProvider } from '../ports/identity-provider';

export interface AcceptInvitationInput {
  /** Segredo recebido no link do e-mail. */
  token: string;
  password: string;
}

/**
 * Aceite do convite pelo ADMIN (RN06): define a senha no SuperTokens, deixa o ADMIN ACTIVE,
 * preenche o `email_verified_at` e marca o token como usado. Depois disso, o ADMIN faz login
 * normalmente pelo `/api/auth/signin`.
 *
 * Um token inexistente, expirado, usado ou substituído por reenvio gera sempre o mesmo
 * `InvalidUserTokenError` (422).
 */
@Injectable()
export class AcceptInvitationUseCase implements UseCase<AcceptInvitationInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: AcceptInvitationInput): Promise<void> {
    const password = Password.create(input.password);
    const token = await this.userTokenRepository.findByHash(UserToken.hash(input.token));

    if (!token || token.type !== UserTokenType.INVITATION || !token.isUsable()) {
      throw new InvalidUserTokenError();
    }

    // O convite de um ADMIN excluído (ou que já saiu de PENDING) não vale mais.
    const admin = await this.userRepository.findById(token.userId);
    if (admin?.status !== UserStatus.PENDING) {
      throw new InvalidUserTokenError();
    }

    // A senha é trocada antes da gravação no MySQL. Se a gravação falhar, o ADMIN continua
    // PENDING e o token continua válido, então basta aceitar o convite de novo.
    await this.identityProvider.updatePassword(admin.id, password);

    admin.acceptInvitation();
    token.use();
    await this.userRepository.saveWithToken(admin, token);
  }
}
