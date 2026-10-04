import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';

export interface AuthorizeSignInInput {
  /** Id do usuário cuja senha o SuperTokens acabou de conferir. */
  userId: string;
}

/**
 * Quando o MFA existir, o resultado ganha a indicação de que falta a segunda etapa
 * (ex.: `{ allowed: true; secondFactorRequired: boolean }`).
 */
export type AuthorizeSignInOutput = { allowed: true } | { allowed: false };

/**
 * Decide, depois de a senha ser conferida, se o usuário pode entrar: só usuários ACTIVE e
 * não excluídos fazem login (RN09). Quando pode, registra o `last_login_at`.
 *
 * Quem chama responde com o mesmo erro genérico da senha incorreta quando o login é
 * recusado, para não revelar se o e-mail existe.
 */
@Injectable()
export class AuthorizeSignInUseCase implements UseCase<
  AuthorizeSignInInput,
  AuthorizeSignInOutput
> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(input: AuthorizeSignInInput): Promise<AuthorizeSignInOutput> {
    // O repositório ignora os excluídos, então um usuário excluído também volta null.
    const user = await this.userRepository.findById(input.userId);

    if (!user?.canAccess()) {
      return { allowed: false };
    }

    user.recordLogin();
    await this.userRepository.save(user);

    return { allowed: true };
  }
}
