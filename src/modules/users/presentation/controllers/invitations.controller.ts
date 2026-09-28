import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '@modules/auth/presentation/decorators/public.decorator';

import { AcceptInvitationUseCase } from '../../application/use-cases/accept-invitation.use-case';
import {
  type AcceptInvitationBody,
  acceptInvitationBodySchema,
} from '../dtos/accept-invitation.dto';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly acceptInvitationUseCase: AcceptInvitationUseCase) {}

  /**
   * Aceite do convite pelo ADMIN, que ainda não tem sessão (RN06). Responde 204, e o painel
   * segue para o login com a senha definida.
   */
  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(@Body({ schema: acceptInvitationBodySchema }) body: AcceptInvitationBody): Promise<void> {
    return this.acceptInvitationUseCase.execute(body);
  }
}
