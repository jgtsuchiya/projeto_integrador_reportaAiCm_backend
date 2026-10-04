import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { z } from 'zod';

import { CurrentUser } from '@modules/auth/presentation/decorators/current-user.decorator';
import { Roles } from '@modules/auth/presentation/decorators/roles.decorator';

import { InvitationOutput } from '../../application/services/admin-invitation.service';
import type { AuthenticatedUser } from '../../application/use-cases/get-authenticated-user.use-case';
import {
  InviteAdminOutput,
  InviteAdminUseCase,
} from '../../application/use-cases/invite-admin.use-case';
import { ResendAdminInvitationUseCase } from '../../application/use-cases/resend-admin-invitation.use-case';
import { Role } from '../../domain/value-objects/role';
import { type InviteAdminBody, inviteAdminBodySchema } from '../dtos/invite-admin.dto';

/** Gestão de ADMINs: só o SUPER_ADMIN (RN04). */
@Roles(Role.SUPER_ADMIN)
@Controller('admins')
export class AdminsController {
  constructor(
    private readonly inviteAdminUseCase: InviteAdminUseCase,
    private readonly resendAdminInvitationUseCase: ResendAdminInvitationUseCase,
  ) {}

  /**
   * Cria o ADMIN PENDING e envia o convite (RN06). Responde 201 mesmo se o e-mail falhar,
   * com `invitation.sent: false`, porque o ADMIN já foi criado e o convite pode ser reenviado.
   */
  @Post()
  invite(
    @Body({ schema: inviteAdminBodySchema }) body: InviteAdminBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InviteAdminOutput> {
    return this.inviteAdminUseCase.execute({ ...body, invitedById: user.id });
  }

  /** Reenvia o convite de um ADMIN PENDING, invalidando os links anteriores (RN06). */
  @Post(':id/invitation')
  @HttpCode(HttpStatus.OK)
  resendInvitation(@Param('id', { schema: z.uuid() }) id: string): Promise<InvitationOutput> {
    return this.resendAdminInvitationUseCase.execute({ adminId: id });
  }
}
