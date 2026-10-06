import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '@modules/auth/presentation/decorators/public.decorator';
import { BackgroundTasks } from '@shared/application/ports/background-tasks';

import { RequestPasswordResetUseCase } from '../../application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import {
  type RequestPasswordResetBody,
  requestPasswordResetBodySchema,
  type ResetPasswordBody,
  resetPasswordBodySchema,
} from '../dtos/password-reset.dto';

/** Recuperação de senha por e-mail, igual para os três papéis. As duas rotas são públicas. */
@Controller('password-resets')
export class PasswordResetsController {
  constructor(
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly backgroundTasks: BackgroundTasks,
  ) {}

  /**
   * Pedido do link de redefinição (RN20). Responde sempre 204, sem esperar a busca da conta
   * nem o envio do e-mail: assim, nem a resposta nem o tempo dela revelam se o e-mail tem
   * conta. Uma falha no pedido vai só para o log.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  request(@Body({ schema: requestPasswordResetBodySchema }) body: RequestPasswordResetBody): void {
    this.backgroundTasks.run('Pedido de redefinição de senha', () =>
      this.requestPasswordResetUseCase.execute(body),
    );
  }

  /**
   * Redefinição da senha com o token do link, por quem não tem sessão (RN21). Responde 204, e
   * o front segue para o login com a senha nova.
   */
  @Public()
  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  confirm(@Body({ schema: resetPasswordBodySchema }) body: ResetPasswordBody): Promise<void> {
    return this.resetPasswordUseCase.execute(body);
  }
}
