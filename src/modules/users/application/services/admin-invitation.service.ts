import { Injectable } from '@nestjs/common';

import { renderMailTemplate } from '@shared/application/mail/mail-template';
import { MailDeliveryError, MailSender } from '@shared/application/ports/mail-sender';

import { IssuedUserToken, UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { UserTokenType } from '../../domain/value-objects/user-token-type';

/** Página do painel web que recebe o token e mostra o formulário de senha. */
export const INVITATION_PAGE_PATH = '/convite';

export const INVITATION_MAIL_SUBJECT = 'Convite para o painel do ReportaAi Cm';

/**
 * Configuração do convite, lida das variáveis de ambiente pelo UsersModule. Fica numa classe
 * própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class AdminInvitationConfig {
  /** `WEB_APP_URL`: o link do convite aponta para a página `/convite` do painel. */
  abstract readonly webAppUrl: string;
  /** `INVITATION_EXPIRES_IN_HOURS`. */
  abstract readonly expiresInHours: number;
}

/** Situação do convite, devolvida ao SuperAdm no convite e no reenvio. */
export interface InvitationOutput {
  /** false quando o servidor de e-mail recusou a mensagem: o convite pode ser reenviado. */
  sent: boolean;
  expiresAt: Date;
}

/**
 * Emissão e envio do convite do ADMIN (RN06), comuns ao convite e ao reenvio.
 * Quem chama grava o token entre as duas etapas: o link só vai por e-mail depois de gravado.
 */
@Injectable()
export class AdminInvitationService {
  constructor(
    private readonly mailSender: MailSender,
    private readonly config: AdminInvitationConfig,
  ) {}

  /** Gera o token do convite, com a validade de `INVITATION_EXPIRES_IN_HOURS`. */
  issue(adminId: string): IssuedUserToken {
    return UserToken.issue({
      userId: adminId,
      type: UserTokenType.INVITATION,
      validForHours: this.config.expiresInHours,
    });
  }

  /**
   * Envia o e-mail com o link do convite. Uma falha no SMTP não desfaz o convite: o ADMIN
   * continua PENDING e o SuperAdm pode reenviá-lo. Por isso, ela vira `sent: false`, e o
   * motivo fica no log do `MailSender`.
   */
  async send(admin: User, { token, secret }: IssuedUserToken): Promise<InvitationOutput> {
    const hours = this.config.expiresInHours;

    try {
      await this.mailSender.send({
        to: admin.email.value,
        subject: INVITATION_MAIL_SUBJECT,
        ...renderMailTemplate({
          title: 'Convite para o painel',
          paragraphs: [
            `Olá, ${admin.name}!`,
            'Você recebeu um convite para acessar o painel do ReportaAi Cm como administrador.',
            'Para ativar o seu acesso, defina a sua senha no link abaixo.',
          ],
          action: { label: 'Definir minha senha', url: this.buildUrl(secret) },
          note: `O link vale por ${hours} ${hours === 1 ? 'hora' : 'horas'} e só pode ser usado uma vez. Se você não esperava este convite, ignore este e-mail.`,
        }),
      });
    } catch (error) {
      if (!(error instanceof MailDeliveryError)) {
        throw error;
      }

      return { sent: false, expiresAt: token.expiresAt };
    }

    return { sent: true, expiresAt: token.expiresAt };
  }

  /** `${WEB_APP_URL}/convite?token=...`, mantendo um eventual caminho do `WEB_APP_URL`. */
  private buildUrl(secret: string): string {
    const url = new URL(`${this.config.webAppUrl.replace(/\/+$/, '')}${INVITATION_PAGE_PATH}`);
    url.searchParams.set('token', secret);

    return url.toString();
  }
}
