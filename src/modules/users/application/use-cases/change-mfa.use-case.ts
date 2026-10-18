import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { IncorrectPasswordError } from '../../domain/errors/incorrect-password.error';
import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { ProfileOutput, toProfileOutput } from '../dtos/profile.output';
import { IdentityProvider } from '../ports/identity-provider';
import { findAccountOrFail } from '../services/find-account';

export interface ChangeMfaInput {
  /** Usuário da sessão. */
  userId: string;
  /** Sessão da requisição, a única mantida quando a verificação é ativada. */
  sessionHandle: string;
  /** `true` ativa a verificação em duas etapas, e `false` desativa. */
  enabled: boolean;
  /** Senha atual, que confirma a mudança. */
  password: string;
}

/**
 * Liga ou desliga a verificação em duas etapas da própria conta (RN24), confirmada com a senha
 * atual. Uma senha incorreta gera `IncorrectPasswordError` (401), e ativar sem o e-mail
 * verificado, `EmailNotVerifiedError` (422). Pedir o estado que a conta já tem responde o
 * perfil sem efeito nenhum.
 *
 * Ativar revoga as outras sessões do usuário, que passam pela segunda etapa no próximo login.
 * A sessão de quem ativou continua completa: a claim dela foi gravada no login, que não pediu
 * o código. Desativar não revoga nada.
 *
 * O `mfa_enabled` é gravado antes de as sessões serem revogadas: assim, um login feito entre
 * os dois passos já abre uma sessão pendente. Se a revogação falhar, a verificação fica ativa,
 * e o usuário encerra as outras sessões pelo `DELETE /api/users/me/sessions`.
 */
@Injectable()
export class ChangeMfaUseCase implements UseCase<ChangeMfaInput, ProfileOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: ChangeMfaInput): Promise<ProfileOutput> {
    const { user, profile } = await findAccountOrFail(
      this.userRepository,
      this.clientProfileRepository,
      input.userId,
    );

    if (!(await this.identityProvider.verifyPassword(user.email, input.password))) {
      throw new IncorrectPasswordError('password');
    }

    if (user.mfaEnabled === input.enabled) {
      return toProfileOutput(user, profile);
    }

    if (input.enabled) {
      user.enableMfa();
    } else {
      user.disableMfa();
    }
    await this.userRepository.save(user);

    if (input.enabled) {
      await this.identityProvider.revokeOtherSessions(user.id, input.sessionHandle);
    }

    return toProfileOutput(user, profile);
  }
}
