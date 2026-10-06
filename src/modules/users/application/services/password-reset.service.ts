import { Injectable } from '@nestjs/common';

import { IssuedUserToken, UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { UserMailService } from './user-mail.service';

/** Página do painel web que recebe o token e mostra o formulário da senha nova. */
export const PASSWORD_RESET_PAGE_PATH = '/redefinir-senha';

export const PASSWORD_RESET_MAIL_SUBJECT = 'Redefinição de senha do ReportaAi Cm';

/**
 * Configuração da redefinição de senha, lida das variáveis de ambiente pelo UsersModule. Fica
 * numa classe própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class PasswordResetConfig {
  /** `PASSWORD_RESET_EXPIRES_IN_MINUTES`. */
  abstract readonly expiresInMinutes: number;
}

/**
 * Emissão e envio do link de redefinição de senha (RN20). Quem chama grava o token entre as
 * duas etapas: o link só vai por e-mail depois de gravado.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly userMailService: UserMailService,
    private readonly config: PasswordResetConfig,
  ) {}

  /** Gera o token da redefinição, com a validade de `PASSWORD_RESET_EXPIRES_IN_MINUTES`. */
  issue(userId: string): IssuedUserToken {
    return UserToken.issue({
      userId,
      type: UserTokenType.PASSWORD_RESET,
      validForMinutes: this.config.expiresInMinutes,
    });
  }

  /**
   * Envia o e-mail com o link da redefinição e devolve se o servidor de e-mail aceitou a
   * mensagem. Uma falha no SMTP não vira erro: o motivo fica no log do `MailSender`, e o
   * usuário pede o link de novo.
   */
  send(user: User, { secret }: IssuedUserToken): Promise<boolean> {
    const minutes = this.config.expiresInMinutes;

    return this.userMailService.send({
      to: user.email.value,
      subject: PASSWORD_RESET_MAIL_SUBJECT,
      content: {
        title: 'Redefinição de senha',
        paragraphs: [
          `Olá, ${user.name}!`,
          'Recebemos um pedido para redefinir a senha da sua conta no ReportaAi Cm.',
          'Para escolher uma senha nova, use o link abaixo.',
        ],
        action: {
          label: 'Redefinir minha senha',
          url: this.userMailService.buildLink(PASSWORD_RESET_PAGE_PATH, secret),
        },
        note: `O link vale por ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e só pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail: a sua senha continua a mesma.`,
      },
    });
  }
}
