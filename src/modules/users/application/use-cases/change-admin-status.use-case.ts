import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { UserRepository } from '../../domain/repositories/user.repository';
import { UserStatus } from '../../domain/value-objects/user-status';
import { AdminOutput, toAdminOutput } from '../dtos/admin.output';
import { IdentityProvider } from '../ports/identity-provider';
import { findAdminOrFail } from '../services/find-admin';

export interface ChangeAdminStatusInput {
  adminId: string;
  status: typeof UserStatus.ACTIVE | typeof UserStatus.INACTIVE;
}

/**
 * Inativação e reativação de um ADMIN pelo SuperAdm (RN04). Um ADMIN PENDING não muda de
 * status por aqui: ele só fica ACTIVE aceitando o convite, e o convite é cancelado pela
 * exclusão. A transição inválida gera `InvalidStatusTransitionError` (422).
 *
 * Ao inativar, as sessões do ADMIN são revogadas no SuperTokens (RN10). O status é gravado
 * antes: como o guard confere o MySQL a cada requisição, o bloqueio já vale mesmo se a
 * revogação falhar.
 */
@Injectable()
export class ChangeAdminStatusUseCase implements UseCase<ChangeAdminStatusInput, AdminOutput> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly identityProvider: IdentityProvider,
  ) {}

  async execute(input: ChangeAdminStatusInput): Promise<AdminOutput> {
    const admin = await findAdminOrFail(this.userRepository, input.adminId);

    if (input.status === UserStatus.ACTIVE) {
      admin.activate();
      await this.userRepository.save(admin);
    } else {
      admin.deactivate();
      await this.userRepository.save(admin);
      await this.identityProvider.revokeAllSessions(admin.id);
    }

    return toAdminOutput(admin);
  }
}
