import { MailTemplateContent, renderMailTemplate } from './mail-template';

const FOOTER = 'Este é um e-mail automático do ReportaAi Cm e não recebe respostas.';

describe('renderMailTemplate', () => {
  const content: MailTemplateContent = {
    title: 'Convite para o painel',
    paragraphs: ['Olá, Maria!', 'Você foi convidada para o painel do ReportaAi Cm.'],
    action: { label: 'Definir minha senha', url: 'http://localhost:5173/convite?token=abc' },
    note: 'O link vale por 48 horas.',
  };

  it('deve montar o HTML com o título, os parágrafos, o botão e a observação', () => {
    const { html } = renderMailTemplate(content);

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Convite para o painel</title>');
    expect(html).toContain('>Convite para o painel</h1>');
    expect(html).toContain('>Olá, Maria!</p>');
    expect(html).toContain('>Você foi convidada para o painel do ReportaAi Cm.</p>');
    expect(html).toContain('<a href="http://localhost:5173/convite?token=abc"');
    expect(html).toContain('>Definir minha senha</a>');
    expect(html).toContain('>O link vale por 48 horas.</p>');
    expect(html).toContain(FOOTER);
  });

  it('deve montar o texto puro com o link por extenso', () => {
    const { text } = renderMailTemplate(content);

    expect(text).toBe(
      [
        'Convite para o painel',
        'Olá, Maria!',
        'Você foi convidada para o painel do ReportaAi Cm.',
        'Definir minha senha: http://localhost:5173/convite?token=abc',
        'O link vale por 48 horas.',
        FOOTER,
      ].join('\n\n'),
    );
  });

  it('deve escapar o HTML do conteúdo, mas não o do texto puro', () => {
    const { html, text } = renderMailTemplate({
      title: 'Olá <b>',
      paragraphs: ['<script>alert("x")</script>'],
      action: { label: 'Tom & Jerry', url: 'http://localhost:5173/convite?token=a&b="c"' },
      note: "It's <i>",
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('<title>Olá &lt;b&gt;</title>');
    expect(html).toContain('href="http://localhost:5173/convite?token=a&amp;b=&quot;c&quot;"');
    expect(html).toContain('>Tom &amp; Jerry</a>');
    expect(html).toContain('It&#39;s &lt;i&gt;');
    expect(text).toContain('<script>alert("x")</script>');
  });

  it('deve omitir o botão e a observação quando não são informados', () => {
    const { html, text } = renderMailTemplate({
      title: 'Conta reativada',
      paragraphs: ['Seu acesso foi liberado de novo.'],
    });

    expect(html).not.toContain('<a ');
    expect(text).toBe(['Conta reativada', 'Seu acesso foi liberado de novo.', FOOTER].join('\n\n'));
  });
});
