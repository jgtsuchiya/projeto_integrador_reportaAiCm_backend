import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { ClientOutput, toClientOutput } from '../dtos/client.output';
import { findClientOrFail } from '../services/find-client';

export interface GetClientInput {
  clientId: string;
}

/** Detalhe de um CLIENT para ADMIN e SUPER_ADMIN, com o CPF mascarado (RN12). */
@Injectable()
export class GetClientUseCase implements UseCase<GetClientInput, ClientOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
  ) {}

  async execute(input: GetClientInput): Promise<ClientOutput> {
    const { user, profile } = await findClientOrFail(
      this.userRepository,
      this.clientProfileRepository,
      input.clientId,
    );

    return toClientOutput(user, profile);
  }
}
