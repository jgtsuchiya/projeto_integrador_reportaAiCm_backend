import { Injectable } from '@nestjs/common';

import { UseCase } from '@shared/application/use-case.interface';

import { AdminNotPendingError } from '../../domain/errors/admin-not-pending.error';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserTokenRepository } from '../../domain/repositories/user-token.repository';
import { UserStatus } from '../../domain/value-objects/user-status';
import { AdminInvitationService, InvitationOutput } from '../services/admin-invitation.service';
import { findAdminOrFail } from '../services/find-admin';

export interface ResendAdminInvitationInput {
  adminId: string;
}

/**
 * Reenvio do convite pelo SuperAdm, só enquanto o ADMIN estiver PENDING (RN06). O convite
 * novo substitui os anteriores, cujos links deixam de valer.
 */
@Injectable()
export class ResendAdminInvitationUseCase implements UseCase<
  ResendAdminInvitationInput,
  InvitationOutput
> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userTokenRepository: UserTokenRepository,
    private readonly invitationService: AdminInvitationService,
  ) {}

  async execute(input: ResendAdminInvitationInput): Promise<InvitationOutput> {
    const admin = await findAdminOrFail(this.userRepository, input.adminId);

    if (admin.status !== UserStatus.PENDING) {
      throw new AdminNotPendingError();
    }

    const invitation = this.invitationService.issue(admin.id);
    await this.userTokenRepository.replace(invitation.token);

    return this.invitationService.send(admin, invitation);
  }
}
