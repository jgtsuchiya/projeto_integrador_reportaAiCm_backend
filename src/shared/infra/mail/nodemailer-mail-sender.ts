import { Logger } from '@nestjs/common';
import { createTransport, type NodemailerError, type Transporter } from 'nodemailer';

import type { Env } from '@config/env.schema';
import { MailDeliveryError, MailMessage, MailSender } from '@shared/application/ports/mail-sender';

export type MailEnv = Pick<
  Env,
  'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'
>;

/**
 * Limite de cada etapa da conexão SMTP (conexão, saudação do servidor e inatividade). Os
 * padrões do Nodemailer chegam a minutos, e o envio acontece dentro de uma requisição HTTP.
 */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Implementação do `MailSender` por SMTP, com o Nodemailer. Em dev, o servidor é o Mailpit
 * do docker-compose, que captura os e-mails em http://localhost:8025.
 *
 * Uma falha de envio vai para o log só com o motivo dado pelo Nodemailer, nunca com a
 * configuração do SMTP. Se o servidor repetir o usuário ou a senha na resposta, eles são
 * mascarados antes de chegar ao log.
 */
export class NodemailerMailSender implements MailSender {
  private readonly logger = new Logger(NodemailerMailSender.name);
  private readonly transporter: Transporter;
  private readonly credentials: string[];

  constructor(env: MailEnv) {
    this.transporter = createTransport(
      {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        // Sem usuário, conecta sem autenticação (caso do Mailpit).
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      },
      { from: env.MAIL_FROM },
    );
    this.credentials = [env.SMTP_USER, env.SMTP_PASSWORD].filter((value) => value !== '');
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao enviar o e-mail "${message.subject}": ${this.describeFailure(error)}`,
      );
      throw new MailDeliveryError();
    }
  }

  /** Motivo da falha, com o código do Nodemailer (ex.: EAUTH, ESOCKET) e sem as credenciais. */
  private describeFailure(error: unknown): string {
    const { message, code } =
      error instanceof Error ? (error as NodemailerError) : { message: String(error), code: null };
    const reason = code ? `${message} (${code})` : message;

    return this.credentials.reduce(
      (text, credential) => text.replaceAll(credential, '***'),
      reason,
    );
  }
}
