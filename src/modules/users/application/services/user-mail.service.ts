import { Injectable } from '@nestjs/common';

import { MailTemplateContent, renderMailTemplate } from '@shared/application/mail/mail-template';
import { MailDeliveryError, MailSender } from '@shared/application/ports/mail-sender';

/**
 * Configuração dos e-mails da conta, lida das variáveis de ambiente pelo UsersModule. Fica
 * numa classe própria para os casos de uso não dependerem do `ConfigService`.
 */
export abstract class UserMailConfig {
  /** `WEB_APP_URL`: os links dos e-mails apontam sempre para uma página do painel web. */
  abstract readonly webAppUrl: string;
}

export interface UserMail {
  to: string;
  subject: string;
  content: MailTemplateContent;
}

/**
 * O que é comum aos e-mails da conta (convite, redefinição de senha, verificação de e-mail e
 * código da segunda etapa): montar o link com o token e tratar a falha de envio.
 */
@Injectable()
export class UserMailService {
  constructor(
    private readonly mailSender: MailSender,
    private readonly config: UserMailConfig,
  ) {}

  /** `${WEB_APP_URL}<página>?token=...`, mantendo um eventual caminho do `WEB_APP_URL`. */
  buildLink(pagePath: string, secret: string): string {
    const url = new URL(`${this.config.webAppUrl.replace(/\/+$/, '')}${pagePath}`);
    url.searchParams.set('token', secret);

    return url.toString();
  }

  /**
   * Envia o e-mail no layout comum e devolve se o servidor de e-mail aceitou a mensagem. Uma
   * falha no SMTP (`MailDeliveryError`) vira `false` em vez de erro: nenhum fluxo é desfeito
   * por causa do e-mail, que pode ser reenviado. O motivo fica no log do `MailSender`.
   */
  async send({ to, subject, content }: UserMail): Promise<boolean> {
    try {
      await this.mailSender.send({ to, subject, ...renderMailTemplate(content) });
    } catch (error) {
      if (!(error instanceof MailDeliveryError)) {
        throw error;
      }

      return false;
    }

    return true;
  }
}
