import { Injectable } from '@nestjs/common';

import { IssuedUserToken, UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import { UserMailService } from './user-mail.service';

/** Página do painel web que recebe o token e confirma o e-mail. */
export const EMAIL_VERIFICATION_PAGE_PATH = '/verificar-email';

export const EMAIL_VERIFICATION_MAIL_SUBJECT = 'Confirme o seu e-mail no ReportaAi Cm';

const MINUTES_PER_HOUR = 60;

/**
 * Configuração da verificação de e-mail, lida das variáveis de ambiente pelo UsersModule. Fica
 * numa classe própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class EmailVerificationConfig {
  /** `EMAIL_VERIFICATION_EXPIRES_IN_HOURS`. */
  abstract readonly expiresInHours: number;
}

/**
 * Emissão e envio do link de verificação de e-mail (RN22), comuns ao cadastro do CLIENT e ao
 * reenvio. Quem chama grava o token entre as duas etapas: o link só vai por e-mail depois de
 * gravado.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly userMailService: UserMailService,
    private readonly config: EmailVerificationConfig,
  ) {}

  /** Gera o token da verificação, com a validade de `EMAIL_VERIFICATION_EXPIRES_IN_HOURS`. */
  issue(userId: string): IssuedUserToken {
    return UserToken.issue({
      userId,
      type: UserTokenType.EMAIL_VERIFICATION,
      validForMinutes: this.config.expiresInHours * MINUTES_PER_HOUR,
    });
  }

  /**
   * Envia o e-mail com o link de verificação e devolve se o servidor de e-mail aceitou a
   * mensagem. Uma falha no SMTP não vira erro: o motivo fica no log do `MailSender`, e o
   * usuário pede o reenvio.
   */
  send(user: User, { secret }: IssuedUserToken): Promise<boolean> {
    const hours = this.config.expiresInHours;

    return this.userMailService.send({
      to: user.email.value,
      subject: EMAIL_VERIFICATION_MAIL_SUBJECT,
      content: {
        title: 'Confirme o seu e-mail',
        paragraphs: [
          `Olá, ${user.name}!`,
          'Este e-mail foi informado numa conta do ReportaAi Cm.',
          'Para confirmar que ele é seu, use o link abaixo.',
        ],
        action: {
          label: 'Confirmar meu e-mail',
          url: this.userMailService.buildLink(EMAIL_VERIFICATION_PAGE_PATH, secret),
        },
        note: `O link vale por ${hours} ${hours === 1 ? 'hora' : 'horas'} e só pode ser usado uma vez. Se você não criou uma conta no ReportaAi Cm, ignore este e-mail.`,
      },
    });
  }
}
