import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SessionContainer } from 'supertokens-node/recipe/session';

import type { AuthenticatedUser } from '@modules/users/application/use-cases/get-authenticated-user.use-case';
import { ResendLoginCodeUseCase } from '@modules/users/application/use-cases/resend-login-code.use-case';
import { VerifyLoginCodeUseCase } from '@modules/users/application/use-cases/verify-login-code.use-case';
import {
  type VerifyLoginCodeBody,
  verifyLoginCodeBodySchema,
} from '@modules/users/presentation/dtos/login-code.dto';

import { SessionSecondFactor } from '../../application/ports/session-second-factor';
import { AllowPendingSecondFactor } from '../decorators/allow-pending-second-factor.decorator';
import { CurrentSession } from '../decorators/current-session.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';

export const SECOND_FACTOR_NOT_PENDING_MESSAGE =
  'Esta sessão não tem uma verificação em duas etapas pendente.';

/**
 * Segunda etapa do login de quem tem a verificação em duas etapas ativa (RN25). As rotas são
 * as únicas da aplicação que a sessão pendente acessa, e só ela: a sessão completa recebe 422,
 * para não gastar o código de outro aparelho nem disparar um e-mail à toa.
 *
 * O controller fica no módulo `auth` porque junta os dois lados: o código, que é do módulo
 * `users`, e a sessão do SuperTokens, que só este módulo conhece.
 */
@AllowPendingSecondFactor()
@Controller('mfa')
export class MfaController {
  constructor(
    private readonly verifyLoginCodeUseCase: VerifyLoginCodeUseCase,
    private readonly resendLoginCodeUseCase: ResendLoginCodeUseCase,
    private readonly sessionSecondFactor: SessionSecondFactor<SessionContainer>,
  ) {}

  /**
   * Confere o código recebido por e-mail e conclui o login: a sessão passa a ser completa, e
   * o access token atualizado volta nesta resposta. Responde 204. O código errado, vencido, já
   * usado ou com 5 erros responde 422.
   */
  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verify(
    @Body({ schema: verifyLoginCodeBodySchema }) body: VerifyLoginCodeBody,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: SessionContainer,
  ): Promise<void> {
    await this.ensurePending(session);
    await this.verifyLoginCodeUseCase.execute({ userId: user.id, code: body.code });
    await this.sessionSecondFactor.complete(session);
  }

  /**
   * Envia um código novo e invalida o anterior. Responde 204, ou 422 quando o último código
   * saiu há menos de um minuto.
   */
  @Post('code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendCode(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: SessionContainer,
  ): Promise<void> {
    await this.ensurePending(session);
    await this.resendLoginCodeUseCase.execute({ userId: user.id });
  }

  private async ensurePending(session: SessionContainer): Promise<void> {
    if (!(await this.sessionSecondFactor.isPending(session))) {
      throw new UnprocessableEntityException(SECOND_FACTOR_NOT_PENDING_MESSAGE);
    }
  }
}
