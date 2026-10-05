import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';

import { CurrentUser } from '@modules/auth/presentation/decorators/current-user.decorator';
import { Roles } from '@modules/auth/presentation/decorators/roles.decorator';
import type { Page } from '@shared/domain/pagination';

import type { AdminOutput } from '../../application/dtos/admin.output';
import { InvitationOutput } from '../../application/services/admin-invitation.service';
import { ChangeAdminStatusUseCase } from '../../application/use-cases/change-admin-status.use-case';
import { DeleteAdminUseCase } from '../../application/use-cases/delete-admin.use-case';
import { GetAdminUseCase } from '../../application/use-cases/get-admin.use-case';
import type { AuthenticatedUser } from '../../application/use-cases/get-authenticated-user.use-case';
import {
  InviteAdminOutput,
  InviteAdminUseCase,
} from '../../application/use-cases/invite-admin.use-case';
import { ListAdminsUseCase } from '../../application/use-cases/list-admins.use-case';
import { ResendAdminInvitationUseCase } from '../../application/use-cases/resend-admin-invitation.use-case';
import { UpdateAdminUseCase } from '../../application/use-cases/update-admin.use-case';
import { Role } from '../../domain/value-objects/role';
import { type InviteAdminBody, inviteAdminBodySchema } from '../dtos/invite-admin.dto';
import {
  type ChangeAdminStatusBody,
  changeAdminStatusBodySchema,
  type ListAdminsQuery,
  listAdminsQuerySchema,
  type UpdateAdminBody,
  updateAdminBodySchema,
} from '../dtos/manage-admin.dto';

/** Gestão de ADMINs: só o SUPER_ADMIN (RN04). Ids que não são de ADMIN respondem 404. */
@Roles(Role.SUPER_ADMIN)
@Controller('admins')
export class AdminsController {
  constructor(
    private readonly inviteAdminUseCase: InviteAdminUseCase,
    private readonly resendAdminInvitationUseCase: ResendAdminInvitationUseCase,
    private readonly listAdminsUseCase: ListAdminsUseCase,
    private readonly getAdminUseCase: GetAdminUseCase,
    private readonly updateAdminUseCase: UpdateAdminUseCase,
    private readonly changeAdminStatusUseCase: ChangeAdminStatusUseCase,
    private readonly deleteAdminUseCase: DeleteAdminUseCase,
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

  /** Lista paginada, com filtro opcional por status. */
  @Get()
  list(
    @Query({ schema: listAdminsQuerySchema }) query: ListAdminsQuery,
  ): Promise<Page<AdminOutput>> {
    return this.listAdminsUseCase.execute(query);
  }

  @Get(':id')
  findOne(@Param('id', { schema: z.uuid() }) id: string): Promise<AdminOutput> {
    return this.getAdminUseCase.execute({ adminId: id });
  }

  /** Edita o nome do ADMIN. */
  @Patch(':id')
  update(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: updateAdminBodySchema }) body: UpdateAdminBody,
  ): Promise<AdminOutput> {
    return this.updateAdminUseCase.execute({ adminId: id, ...body });
  }

  /** Inativa ou reativa o ADMIN. Ao inativar, as sessões dele são revogadas (RN10). */
  @Patch(':id/status')
  changeStatus(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: changeAdminStatusBodySchema }) body: ChangeAdminStatusBody,
  ): Promise<AdminOutput> {
    return this.changeAdminStatusUseCase.execute({ adminId: id, ...body });
  }

  /** Reenvia o convite de um ADMIN PENDING, invalidando os links anteriores (RN06). */
  @Post(':id/invitation')
  @HttpCode(HttpStatus.OK)
  resendInvitation(@Param('id', { schema: z.uuid() }) id: string): Promise<InvitationOutput> {
    return this.resendAdminInvitationUseCase.execute({ adminId: id });
  }

  /** Exclusão lógica com anonimização do e-mail (RN11). Também cancela um convite pendente. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    return this.deleteAdminUseCase.execute({ adminId: id });
  }
}
