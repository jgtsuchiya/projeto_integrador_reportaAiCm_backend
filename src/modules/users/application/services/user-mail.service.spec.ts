import { MailDeliveryError } from '@shared/application/ports/mail-sender';
import { FakeMailSender } from '@shared/testing/fake-mail-sender';

import { UserMail, UserMailService } from './user-mail.service';

describe('UserMailService', () => {
  const mail: UserMail = {
    to: 'maria@example.com',
    subject: 'Redefinição de senha',
    content: {
      title: 'Redefinir a senha',
      paragraphs: ['Olá, Maria <Silva>!'],
      action: { label: 'Escolher a senha', url: 'http://localhost:5173/redefinir-senha?token=abc' },
      note: 'O link vale por 60 minutos.',
    },
  };
  let mailSender: FakeMailSender;
  let sut: UserMailService;

  beforeEach(() => {
    mailSender = new FakeMailSender();
    sut = new UserMailService(mailSender, { webAppUrl: 'http://localhost:5173' });
  });

  describe('buildLink', () => {
    it('deve montar o link da página do painel com o token', () => {
      expect(sut.buildLink('/redefinir-senha', 'abc-123_XYZ')).toBe(
        'http://localhost:5173/redefinir-senha?token=abc-123_XYZ',
      );
    });

    it.each(['https://reportaai.example.com/painel', 'https://reportaai.example.com/painel//'])(
      'deve manter o caminho do WEB_APP_URL %p',
      (webAppUrl) => {
        sut = new UserMailService(mailSender, { webAppUrl });

        expect(sut.buildLink('/verificar-email', 'abc')).toBe(
          'https://reportaai.example.com/painel/verificar-email?token=abc',
        );
      },
    );

    it('deve codificar o token na URL', () => {
      expect(sut.buildLink('/convite', 'a b&c=d')).toBe(
        'http://localhost:5173/convite?token=a+b%26c%3Dd',
      );
    });
  });

  describe('send', () => {
    it('deve enviar o e-mail no layout comum, em HTML e em texto puro', async () => {
      await expect(sut.send(mail)).resolves.toBe(true);

      expect(mailSender.messages).toHaveLength(1);
      const [message] = mailSender.messages;
      expect(message.to).toBe('maria@example.com');
      expect(message.subject).toBe('Redefinição de senha');
      expect(message.text).toContain('Olá, Maria <Silva>!');
      expect(message.text).toContain(
        'Escolher a senha: http://localhost:5173/redefinir-senha?token=abc',
      );
      expect(message.text).toContain('O link vale por 60 minutos.');
      expect(message.html).toContain('Olá, Maria &lt;Silva&gt;!');
      expect(message.html).toContain('href="http://localhost:5173/redefinir-senha?token=abc"');
    });

    it('deve enviar um e-mail sem link, como o do código da segunda etapa', async () => {
      const result = await sut.send({
        to: 'maria@example.com',
        subject: 'Código de acesso',
        content: { title: 'Código de acesso', paragraphs: ['O seu código é 123456.'] },
      });

      expect(result).toBe(true);
      expect(mailSender.messages[0].text).toContain('O seu código é 123456.');
      expect(mailSender.messages[0].html).not.toContain('href=');
    });

    it('deve responder false quando o servidor de e-mail recusa a mensagem', async () => {
      jest.spyOn(mailSender, 'send').mockRejectedValue(new MailDeliveryError());

      await expect(sut.send(mail)).resolves.toBe(false);
    });

    it('deve repassar um erro que não seja de envio', async () => {
      const failure = new Error('Bug no template.');
      jest.spyOn(mailSender, 'send').mockRejectedValue(failure);

      await expect(sut.send(mail)).rejects.toBe(failure);
    });
  });
});
