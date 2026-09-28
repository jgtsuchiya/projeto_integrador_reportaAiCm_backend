import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { envSchema } from '@config/env.schema';
import { renderMailTemplate } from '@shared/application/mail/mail-template';
import { MailSender } from '@shared/application/ports/mail-sender';
import { MailModule } from '@shared/infra/mail/mail.module';

/** Campos usados da mensagem na API do Mailpit (`GET /api/v1/message/{ID}`). */
interface MailpitMessage {
  From: { Name: string; Address: string };
  To: { Name: string; Address: string }[];
  Subject: string;
  HTML: string;
  Text: string;
}

describe('Envio de e-mail (integração)', () => {
  const env = envSchema.parse(process.env);
  // O Mailpit do docker-compose (e do CI) responde o SMTP e a API no mesmo host.
  const mailpitApi = `http://${env.SMTP_HOST}:8025/api/v1`;
  const receivedIds: string[] = [];
  let moduleRef: TestingModule;
  let sut: MailSender;

  beforeAll(async () => {
    // Proteção: o teste só envia pelo Mailpit, nunca por um servidor SMTP de verdade.
    const info = await fetch(`${mailpitApi}/info`).catch(() => undefined);
    if (!info?.ok) {
      throw new Error(
        `Mailpit não encontrado em ${mailpitApi}. Suba o ambiente com npm run db:up.`,
      );
    }

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }), MailModule],
    }).compile();
    sut = moduleRef.get(MailSender);
  });

  afterAll(async () => {
    if (receivedIds.length > 0) {
      await fetch(`${mailpitApi}/messages`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ IDs: receivedIds }),
      });
    }
    await moduleRef?.close();
  });

  async function findMessageTo(to: string): Promise<MailpitMessage> {
    const query = new URLSearchParams({ query: `to:"${to}"` });
    const search = await fetch(`${mailpitApi}/search?${query}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };

    if (messages.length !== 1) {
      throw new Error(`Esperava 1 e-mail para ${to} no Mailpit, mas há ${messages.length}.`);
    }
    receivedIds.push(messages[0].ID);

    const response = await fetch(`${mailpitApi}/message/${messages[0].ID}`);
    return (await response.json()) as MailpitMessage;
  }

  it('deve entregar ao Mailpit o e-mail em HTML e texto puro, com o remetente MAIL_FROM', async () => {
    const to = `mail.${randomUUID()}@reportaai.invalid`;
    const body = renderMailTemplate({
      title: 'Teste de envio',
      paragraphs: ['Olá! Este e-mail foi enviado pelo teste de integração.'],
      action: { label: 'Abrir o painel', url: env.WEB_APP_URL },
    });

    await sut.send({ to, subject: 'Teste de envio', ...body });

    const message = await findMessageTo(to);
    const { Name, Address } = message.From;
    expect(Name ? `${Name} <${Address}>` : Address).toBe(env.MAIL_FROM);
    expect(message.To).toEqual([{ Name: '', Address: to }]);
    expect(message.Subject).toBe('Teste de envio');
    expect(normalizeLineBreaks(message.HTML)).toBe(body.html);
    expect(normalizeLineBreaks(message.Text)).toBe(body.text);
  });
});

/** O SMTP transmite as quebras de linha como CRLF. */
function normalizeLineBreaks(value: string): string {
  return value.replaceAll('\r\n', '\n');
}
