import type { MailMessage } from '@shared/application/ports/mail-sender';

const APP_NAME = 'ReportaAi Cm';
const FOOTER = `Este é um e-mail automático do ${APP_NAME} e não recebe respostas.`;

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export interface MailTemplateAction {
  label: string;
  url: string;
}

export interface MailTemplateContent {
  title: string;
  /** Texto puro: o HTML é escapado, então dados do usuário (ex.: o nome) podem entrar direto. */
  paragraphs: readonly string[];
  /** Botão com link (ex.: o do convite). No texto puro, vira o link por extenso. */
  action?: MailTemplateAction;
  /** Observação em letra menor, depois do botão (ex.: a validade do link). */
  note?: string;
}

export type MailBody = Pick<MailMessage, 'html' | 'text'>;

/**
 * Layout comum dos e-mails da aplicação, nas versões HTML e texto puro. O resultado entra
 * direto no `MailSender`: `send({ to, subject, ...renderMailTemplate(content) })`.
 *
 * O HTML usa só estilos inline, que é o que os clientes de e-mail exibem de forma consistente.
 */
export function renderMailTemplate(content: MailTemplateContent): MailBody {
  return { html: renderHtml(content), text: renderText(content) };
}

function renderHtml({ title, paragraphs, action, note }: MailTemplateContent): string {
  const body = [
    ...paragraphs.map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`),
    action ? renderActionHtml(action) : '',
    note ? `<p style="margin:0 0 16px;font-size:13px;color:#52606d">${escapeHtml(note)}</p>` : '',
  ].join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<div style="max-width:560px;margin:0 auto;padding:32px;background-color:#ffffff;border-radius:8px;font-size:16px;line-height:1.5">
<p style="margin:0 0 16px;font-size:14px;font-weight:bold;color:#52606d">${APP_NAME}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e7eb;font-size:12px;color:#7b8794">${FOOTER}</p>
</div>
</body>
</html>`;
}

function renderActionHtml(action: MailTemplateAction): string {
  const url = escapeHtml(action.url);

  // O link por extenso ajuda quando o cliente de e-mail bloqueia o botão.
  return `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 24px;background-color:#1a56db;border-radius:6px;color:#ffffff;font-weight:bold;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#52606d">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${url}" style="color:#1a56db;word-break:break-all">${url}</a></p>`;
}

function renderText({ title, paragraphs, action, note }: MailTemplateContent): string {
  return [title, ...paragraphs, action && `${action.label}: ${action.url}`, note, FOOTER]
    .filter(Boolean)
    .join('\n\n');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}
