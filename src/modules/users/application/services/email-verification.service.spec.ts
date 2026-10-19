import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  EMAIL_VERIFICATION_MAIL_SUBJECT,
  EmailVerificationService,
} from './email-verification.service';
import { UserMailService } from './user-mail.service';

const HOUR_IN_MS = 60 * 60 * 1000;

describe('EmailVerificationService', () => {
  const user = User.createClient({
    id: 'client-1',
    name: 'Maria <Silva>',
    email: Email.create('maria@example.com'),
  });
  let mailSender: FakeMailSender;
  let sut: EmailVerificationService;

  beforeEach(() => {
    mailSender = new FakeMailSender();
    sut = new EmailVerificationService(
      new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
      { expiresInHours: 24 },
    );
  });

  describe('issue', () => {
    it('deve gerar um token de verificação de e-mail com a validade configurada', () => {
      const { token, secret } = sut.issue(user.id);

      expect(token.userId).toBe(user.id);
      expect(token.type).toBe(UserTokenType.EMAIL_VERIFICATION);
      expect(token.tokenHash).toBe(UserToken.hash(secret));
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(24 * HOUR_IN_MS);
    });
  });

  describe('send', () => {
    it('deve enviar o e-mail com o link da página de verificação do painel', async () => {
      const verification = sut.issue(user.id);

      const sent = await sut.send(user, verification);

      expect(sent).toBe(true);
      expect(mailSender.messages).toHaveLength(1);
      const [message] = mailSender.messages;
      const url = `http://localhost:5173/verificar-email?token=${verification.secret}`;
      expect(message.to).toBe('maria@example.com');
      expect(message.subject).toBe(EMAIL_VERIFICATION_MAIL_SUBJECT);
      expect(message.text).toContain(`Confirmar meu e-mail: ${url}`);
      expect(message.text).toContain('Olá, Maria <Silva>!');
      expect(message.text).toContain('O link vale por 24 horas e só pode ser usado uma vez.');
      expect(message.html).toContain(`href="${url}"`);
      expect(message.html).toContain('Olá, Maria &lt;Silva&gt;!');
    });

    it('deve escrever a validade de 1 hora no singular', async () => {
      sut = new EmailVerificationService(
        new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
        { expiresInHours: 1 },
      );

      await sut.send(user, sut.issue(user.id));

      expect(mailSender.messages[0].text).toContain('O link vale por 1 hora ');
    });

    it('deve responder false quando o servidor de e-mail recusa a mensagem', async () => {
      jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

      await expect(sut.send(user, sut.issue(user.id))).resolves.toBe(false);
    });

    it('deve repassar um erro que não seja de envio', async () => {
      const failure = new Error('Bug no template.');
      jest.spyOn(mailSender, 'send').mockRejectedValue(failure);

      await expect(sut.send(user, sut.issue(user.id))).rejects.toBe(failure);
    });
  });
});
