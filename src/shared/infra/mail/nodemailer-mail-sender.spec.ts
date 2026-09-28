import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

import { MailDeliveryError, MailMessage } from '@shared/application/ports/mail-sender';

import { MailEnv, NodemailerMailSender } from './nodemailer-mail-sender';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('NodemailerMailSender', () => {
  const env: MailEnv = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'usuario-smtp',
    SMTP_PASSWORD: 'senha-smtp-secreta',
    MAIL_FROM: 'ReportaAi Cm <no-reply@reportaai.local>',
  };
  const message: MailMessage = {
    to: 'maria@example.com',
    subject: 'Convite para o painel',
    html: '<p>Olá, Maria!</p>',
    text: 'Olá, Maria!',
  };
  const sendMail = jest.fn();
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest
      .mocked(createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<typeof createTransport>);
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  it('deve criar o transporte SMTP com o ambiente, a autenticação, os timeouts e o remetente', () => {
    new NodemailerMailSender(env);

    expect(createTransport).toHaveBeenCalledWith(
      {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'usuario-smtp', pass: 'senha-smtp-secreta' },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      },
      { from: 'ReportaAi Cm <no-reply@reportaai.local>' },
    );
  });

  it('deve conectar sem autenticação quando não há usuário, como no Mailpit', () => {
    new NodemailerMailSender({ ...env, SMTP_USER: '', SMTP_PASSWORD: '' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', auth: undefined }),
      { from: env.MAIL_FROM },
    );
  });

  it('deve enviar a mensagem com o HTML e o texto puro', async () => {
    sendMail.mockResolvedValue({ messageId: '<1@reportaai.local>' });
    const sut = new NodemailerMailSender(env);

    await sut.send(message);

    expect(sendMail).toHaveBeenCalledWith({
      to: 'maria@example.com',
      subject: 'Convite para o painel',
      html: '<p>Olá, Maria!</p>',
      text: 'Olá, Maria!',
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('deve lançar MailDeliveryError e registrar o motivo no log, sem expor as credenciais', async () => {
    const failure = Object.assign(
      new Error('Invalid login: 535 Authentication failed for usuario-smtp:senha-smtp-secreta'),
      { code: 'EAUTH' },
    );
    sendMail.mockRejectedValue(failure);
    const sut = new NodemailerMailSender(env);

    await expect(sut.send(message)).rejects.toThrow(new MailDeliveryError());

    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'Falha ao enviar o e-mail "Convite para o painel": ' +
        'Invalid login: 535 Authentication failed for ***:*** (EAUTH)',
    );
  });

  it('deve registrar no log uma falha que não é um Error', async () => {
    sendMail.mockRejectedValue('conexão encerrada');
    const sut = new NodemailerMailSender(env);

    await expect(sut.send(message)).rejects.toThrow(MailDeliveryError);

    expect(loggerError).toHaveBeenCalledWith(
      'Falha ao enviar o e-mail "Convite para o painel": conexão encerrada',
    );
  });
});
