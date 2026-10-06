import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '@modules/auth/presentation/decorators/public.decorator';

import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case';
import {
  type ConfirmEmailVerificationBody,
  confirmEmailVerificationBodySchema,
} from '../dtos/email-verification.dto';

/**
 * Confirmação do e-mail pelo link (RN22). O reenvio do link exige sessão e fica no perfil:
 * `POST /api/users/me/email-verification`.
 */
@Controller('email-verifications')
export class EmailVerificationsController {
  constructor(private readonly verifyEmailUseCase: VerifyEmailUseCase) {}

  /**
   * Confirma o e-mail com o token do link. A rota é pública: o link abre no navegador, onde o
   * Client não tem a sessão do app. Responde 204.
   */
  @Public()
  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  confirm(
    @Body({ schema: confirmEmailVerificationBodySchema }) body: ConfirmEmailVerificationBody,
  ): Promise<void> {
    return this.verifyEmailUseCase.execute(body);
  }
}
