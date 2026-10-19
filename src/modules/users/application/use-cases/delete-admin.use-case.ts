import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { LoginAttemptRepository } from '../../domain/repositories/login-attempt.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { IdentityProvider } from '../ports/identity-provider';
import { findAdminOrFail } from '../services/find-admin';

export interface DeleteAdminInput {
  adminId: string;
}

/**
 * Exclusão lógica de um ADMIN pelo SuperAdm (RN04, RN11), em qualquer status. Num ADMIN
 * PENDING, é assim que o convite é cancelado.
 *
 * O usuário é removido do SuperTokens (credenciais e sessões), os tokens de convite e as
 * tentativas de login do e-mail são apagados (RN19) e, no MySQL, o e-mail é anonimizado e o
 * `deleted_at` é preenchido. O nome é mantido para auditoria. Com o e-mail liberado nos dois
 * lados, ele pode receber um novo convite.
 *
 * O SuperTokens é o primeiro: se a gravação no MySQL falhar, o ADMIN continua visível e a
 * exclusão pode ser repetida. Na ordem inversa, uma falha deixaria a credencial órfã, com o
 * e-mail preso no SuperTokens.
 */
@Injectable()
export class DeleteAdminUseCase implements UseCase<DeleteAdminInput, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
    private readonly loginAttemptRepository: LoginAttemptRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: DeleteAdminInput): Promise<void> {
    const admin = await findAdminOrFail(this.userRepository, input.adminId);
    // O e-mail é lido antes da exclusão, que o anonimiza.
    const { email } = admin;

    admin.delete();
    await this.identityProvider.deleteCredentials(admin.id);
    await this.userTokenRepository.deleteByUserId(admin.id);
    await this.loginAttemptRepository.deleteByEmail(email);
    await this.userRepository.save(admin);
  }
}
