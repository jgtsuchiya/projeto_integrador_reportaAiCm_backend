import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserToken } from '../../domain/entities/user-token.entity';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email';
import { UserTokenType } from '../../domain/value-objects/user-token-type';
import {
  AdminInvitationConfig,
  AdminInvitationService,
  INVITATION_MAIL_SUBJECT,
} from './admin-invitation.service';
import { UserMailService } from './user-mail.service';

const HOUR_IN_MS = 60 * 60 * 1000;

describe('AdminInvitationService', () => {
  const config: AdminInvitationConfig = { expiresInHours: 48 };
  const admin = User.createAdmin({
    id: 'admin-1',
    name: 'Ana <Souza>',
    email: Email.create('ana@example.com'),
    createdById: 'super-admin-1',
  });
  let mailSender: FakeMailSender;
  let sut: AdminInvitationService;

  beforeEach(() => {
    mailSender = new FakeMailSender();
    sut = new AdminInvitationService(
      new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' }),
      config,
    );
  });

  describe('issue', () => {
    it('deve gerar um token de convite para o ADMIN com a validade configurada', () => {
      const { token, secret } = sut.issue(admin.id);

      expect(token.userId).toBe(admin.id);
      expect(token.type).toBe(UserTokenType.INVITATION);
      expect(token.tokenHash).toBe(UserToken.hash(secret));
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(48 * HOUR_IN_MS);
    });
  });

  describe('send', () => {
    it('deve enviar o e-mail com o link do convite para o ADMIN', async () => {
      const invitation = sut.issue(admin.id);

      const result = await sut.send(admin, invitation);

      expect(result).toEqual({ sent: true, expiresAt: invitation.token.expiresAt });
      expect(mailSender.messages).toHaveLength(1);
      const [message] = mailSender.messages;
      const url = `http://localhost:5173/convite?token=${invitation.secret}`;
      expect(message.to).toBe('ana@example.com');
      expect(message.subject).toBe(INVITATION_MAIL_SUBJECT);
      expect(message.text).toContain(`Definir minha senha: ${url}`);
      expect(message.text).toContain('Olá, Ana <Souza>!');
      expect(message.text).toContain('O link vale por 48 horas e só pode ser usado uma vez.');
      expect(message.html).toContain(`href="${url}"`);
      expect(message.html).toContain('Olá, Ana &lt;Souza&gt;!');
    });

    it('deve manter o caminho do WEB_APP_URL no link', async () => {
      sut = new AdminInvitationService(
        new UserMailService(mailSender, { webAppUrl: 'https://reportaai.example.com/painel/' }),
        { expiresInHours: 1 },
      );
      const invitation = sut.issue(admin.id);

      await sut.send(admin, invitation);

      expect(mailSender.messages[0].text).toContain(
        `https://reportaai.example.com/painel/convite?token=${invitation.secret}`,
      );
      expect(mailSender.messages[0].text).toContain('O link vale por 1 hora ');
    });

    it('deve responder sent: false quando o servidor de e-mail recusa a mensagem', async () => {
      jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());
      const invitation = sut.issue(admin.id);

      const result = await sut.send(admin, invitation);

      expect(result).toEqual({ sent: false, expiresAt: invitation.token.expiresAt });
    });

    it('deve repassar um erro que não seja de envio', async () => {
      const failure = new Error('Bug no template.');
      jest.spyOn(mailSender, 'send').mockRejectedValue(failure);

      await expect(sut.send(admin, sut.issue(admin.id))).rejects.toBe(failure);
    });
  });
});
