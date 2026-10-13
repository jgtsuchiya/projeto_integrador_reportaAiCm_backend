import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';
import { LoginCodeService } from '../services/login-code.service';

export interface AuthorizeSignInInput {
  /** Id do usuário cuja senha o SuperTokens acabou de conferir. */
  userId: string;
}

export type AuthorizeSignInOutput =
  | { allowed: false }
  | {
      allowed: true;
      /** Falta a segunda etapa: a sessão nasce pendente até o código ser conferido (RN25). */
      secondFactorRequired: boolean;
    };

/**
 * Decide, depois de a senha ser conferida, se o usuário pode entrar: só usuários ACTIVE e
 * não excluídos fazem login (RN09).
 *
 * Com a verificação em duas etapas ativa, o login ainda não está concluído: o código da
 * segunda etapa é enviado por e-mail, e o `last_login_at` só é gravado quando ele é conferido
 * (`VerifyLoginCodeUseCase`). Sem ela, o `last_login_at` é gravado aqui.
 *
 * Quem chama responde com o mesmo erro genérico da senha incorreta quando o login é
 * recusado, para não revelar se o e-mail existe.
 */
@Injectable()
export class AuthorizeSignInUseCase implements UseCase<
  AuthorizeSignInInput,
  AuthorizeSignInOutput
> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly loginCodeService: LoginCodeService,
  ) {}

  async execute(input: AuthorizeSignInInput): Promise<AuthorizeSignInOutput> {
    // O repositório ignora os excluídos, então um usuário excluído também volta null.
    const user = await this.userRepository.findById(input.userId);

    if (!user?.canAccess()) {
      return { allowed: false };
    }

    if (user.mfaEnabled) {
      // Menos de um minuto depois do último código, o login não emite outro: vale o que já
      // foi enviado.
      await this.loginCodeService.send(user);

      return { allowed: true, secondFactorRequired: true };
    }

    user.recordLogin();
    await this.userRepository.save(user);

    return { allowed: true, secondFactorRequired: false };
  }
}
