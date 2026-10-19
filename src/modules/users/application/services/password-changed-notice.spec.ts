import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email';
import {
  PASSWORD_CHANGED_MAIL_SUBJECT,
  sendPasswordChangedNotice,
} from './password-changed-notice';
import { UserMailService } from './user-mail.service';

describe('sendPasswordChangedNotice', () => {
  const user = User.createClient({
    id: 'client-1',
    name: 'Maria <Silva>',
    email: Email.create('maria@example.com'),
  });
  let mailSender: FakeMailSender;
  let userMailService: UserMailService;

  beforeEach(() => {
    mailSender = new FakeMailSender();
    userMailService = new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' });
  });

  it('deve avisar o usuário de que a senha foi alterada, sem link', async () => {
    const sent = await sendPasswordChangedNotice(userMailService, user);

    expect(sent).toBe(true);
    expect(mailSender.messages).toHaveLength(1);
    const [message] = mailSender.messages;
    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe(PASSWORD_CHANGED_MAIL_SUBJECT);
    expect(message.text).toContain('Olá, Maria <Silva>!');
    expect(message.text).toContain('A senha da sua conta no ReportaAi Cm acabou de ser alterada.');
    expect(message.text).toContain('Se não foi você, redefina a senha agora mesmo');
    expect(message.html).toContain('Olá, Maria &lt;Silva&gt;!');
    expect(message.html).not.toContain('href=');
  });

  it('deve responder false quando o servidor de e-mail recusa a mensagem', async () => {
    jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

    await expect(sendPasswordChangedNotice(userMailService, user)).resolves.toBe(false);
  });
});
