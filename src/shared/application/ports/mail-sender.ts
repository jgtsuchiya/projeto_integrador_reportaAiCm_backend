/**
 * E-mail pronto para envio. O corpo vai nas duas versões: HTML e texto puro, para os
 * clientes de e-mail que não exibem HTML. O `renderMailTemplate` monta as duas.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Porta para o envio de e-mail, compartilhada entre os módulos: quem precisa importa o
 * `MailModule` e injeta o `MailSender`. A implementação é o `NodemailerMailSender` (SMTP),
 * e os testes usam o `FakeMailSender`.
 */
export abstract class MailSender {
  /** Lança `MailDeliveryError` se o servidor de e-mail não aceitar a mensagem. */
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Falha no envio de um e-mail. A mensagem é genérica: o motivo (sem as credenciais do SMTP)
 * vai só para o log, registrado pelo adapter.
 */
export class MailDeliveryError extends Error {
  constructor() {
    super('Não foi possível enviar o e-mail.');
    this.name = new.target.name;
  }
}
