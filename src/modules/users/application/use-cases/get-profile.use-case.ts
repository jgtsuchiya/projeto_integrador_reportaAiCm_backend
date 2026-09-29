import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { ProfileOutput, toProfileOutput } from '../dtos/profile.output';
import { findAccountOrFail } from '../services/find-account';

export interface GetProfileInput {
  /** Usuário da sessão. */
  userId: string;
}

/** Perfil e papel do usuário logado. O CLIENT recebe também o perfil completo, com o CPF. */
@Injectable()
export class GetProfileUseCase implements UseCase<GetProfileInput, ProfileOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
  ) {}

  async execute(input: GetProfileInput): Promise<ProfileOutput> {
    const { user, profile } = await findAccountOrFail(
      this.userRepository,
      this.clientProfileRepository,
      input.userId,
    );

    return toProfileOutput(user, profile);
  }
}
