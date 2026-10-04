import { MailMessage, MailSender } from '@shared/application/ports/mail-sender';

/**
 * `MailSender` em memória, para os testes: guarda as mensagens em vez de enviá-las.
 *
 * Nos testes de caso de uso, entra pelo construtor. Nos que sobem a aplicação, substitui o
 * SMTP com `overrideProvider(MailSender).useValue(mailSender)`. Para simular uma falha de envio:
 * `jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError())`.
 */
export class FakeMailSender implements MailSender {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}
