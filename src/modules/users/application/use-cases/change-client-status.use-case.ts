import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { ClientProfileRepository } from '../../domain/repositories/client-profile.repository';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserStatus } from '../../domain/value-objects/user-status';
import { ClientOutput, toClientOutput } from '../dtos/client.output';
import { IdentityProvider } from '../ports/identity-provider';
import { findClientOrFail } from '../services/find-client';

export interface ChangeClientStatusInput {
  clientId: string;
  status: typeof UserStatus.ACTIVE | typeof UserStatus.INACTIVE;
}

/**
 * Inativação e reativação de um CLIENT por ADMIN ou SUPER_ADMIN (RN12). Os dados do CLIENT
 * não mudam por aqui. A transição inválida (ex.: inativar quem já está INACTIVE) gera
 * `InvalidStatusTransitionError` (422).
 *
 * Ao inativar, as sessões do CLIENT são revogadas no SuperTokens (RN10). O status é gravado
 * antes: como o guard confere o MySQL a cada requisição, o bloqueio já vale mesmo se a
 * revogação falhar.
 */
@Injectable()
export class ChangeClientStatusUseCase implements UseCase<ChangeClientStatusInput, ClientOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clientProfileRepository: ClientProfileRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: ChangeClientStatusInput): Promise<ClientOutput> {
    const { user: client, profile } = await findClientOrFail(
      this.userRepository,
      this.clientProfileRepository,
      input.clientId,
    );

    if (input.status === UserStatus.ACTIVE) {
      client.activate();
      await this.userRepository.save(client);
    } else {
      client.deactivate();
      await this.userRepository.save(client);
      await this.identityProvider.revokeAllSessions(client.id);
    }

    return toClientOutput(client, profile);
  }
}
