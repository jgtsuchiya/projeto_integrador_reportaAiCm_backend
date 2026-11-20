import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type request from 'supertest';

import { INVALID_JSON_MESSAGE } from '@shared/presentation/middlewares/body-parser.middleware';

import {
  Actor,
  buildClientPayload,
  buildReportPayload,
  CAMPO_MOURAO,
  E2eApp,
  fixtureBase64,
  ReportPayload,
  Tokens,
} from './support/e2e-app';
import { MemoryLogger } from './support/memory-logger';

const BEARER = { type: 'bearer' } as const;

/** Marcadores dos segmentos do cabeçalho do JPEG, do primeiro depois do SOI até o SOS. */
function jpegHeaderMarkers(bytes: Buffer): number[] {
  const markers: number[] = [];
  let offset = 2;

  while (offset < bytes.length) {
    const marker = bytes[offset + 1];
    markers.push(marker);
    if (marker === 0xda) {
      break;
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }

  return markers;
}

/**
 * Detalhes das rotas de reportes contra o MySQL de teste e o SuperTokens: a validação do corpo,
 * o limite do tamanho, os metadados da foto, os pedidos simultâneos e o log. Os fluxos ficam no
 * `reports.e2e-spec.ts`.
 */
describe('Reportes (integração)', () => {
  const logger = new MemoryLogger();
  let e2e: E2eApp;
  /** Autor dos reportes que os testes só leem. */
  let author: Actor;
  /** Outro Client, que vê os reportes do autor como qualquer cidadão. */
  let other: Actor;

  beforeAll(async () => {
    e2e = await E2eApp.start({ logger });
    await e2e.seedSuperAdmin();
    author = await e2e.registerVerifiedClient();
    other = await e2e.registerVerifiedClient();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function post(
    session: Tokens,
    body: unknown,
    headers: Record<string, string> = {},
  ): request.Test {
    return e2e
      .api()
      .post('/api/reports')
      .auth(session.accessToken, BEARER)
      .set(headers)
      .send(body as object);
  }

  function get(session: Tokens, path: string): request.Test {
    return e2e.api().get(`/api${path}`).auth(session.accessToken, BEARER);
  }

  function patch(session: Tokens, id: string, body: object): request.Test {
    return e2e.api().patch(`/api/reports/${id}`).auth(session.accessToken, BEARER).send(body);
  }

  function remove(session: Tokens, id: string): request.Test {
    return e2e.api().delete(`/api/reports/${id}`).auth(session.accessToken, BEARER);
  }

  function payloadWithPhoto(content: string, thumbnail?: string): ReportPayload {
    const payload = buildReportPayload();

    return { ...payload, photo: { content, thumbnail: thumbnail ?? payload.photo.thumbnail } };
  }

  describe('validação da foto (T2)', () => {
    it.each([
      ['um PNG', 'photo.png'],
      ['um WebP', 'photo.webp'],
      ['um HEIC', 'photo.heic'],
    ])('deve recusar %s com 400 e o campo photo.content', async (_case, fixture) => {
      const response = await post(author, payloadWithPhoto(fixtureBase64(fixture)));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Dados inválidos.',
        details: [{ field: 'photo.content', message: 'A foto precisa ser uma imagem JPEG.' }],
      });
    });

    it.each([
      ['um JPEG cortado', fixtureBase64('report-photo.jpg').slice(0, 1000)],
      ['um arquivo qualquer', Buffer.from('não é uma imagem').toString('base64')],
    ])('deve recusar %s com 400', async (_case, content) => {
      const response = await post(author, payloadWithPhoto(content));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ details: [{ field: 'photo.content' }] });
    });

    it('deve recusar o base64 com o prefixo data: e a miniatura inválida, campo a campo', async () => {
      const response = await post(
        author,
        payloadWithPhoto(`data:image/jpeg;base64,${fixtureBase64('report-photo.jpg')}`, 'abc'),
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: [
          {
            field: 'photo.content',
            message: 'A foto precisa estar em base64, sem o prefixo "data:".',
          },
          {
            field: 'photo.thumbnail',
            message: 'A miniatura precisa estar em base64, sem o prefixo "data:".',
          },
        ],
      });
    });

    it('deve informar todos os campos inválidos de uma vez', async () => {
      const response = await post(author, {
        description: 'a'.repeat(501),
        location: { latitude: -91, longitude: -52, accuracyMeters: -1 },
      });

      expect(response.status).toBe(400);
      expect(
        (response.body as { details: Array<{ field: string }> }).details.map(({ field }) => field),
      ).toEqual(['description', 'location.latitude', 'location.accuracyMeters', 'photo']);
    });
  });

  describe('limite do corpo (T2)', () => {
    it('deve aceitar um corpo de 1 MB nas rotas de reportes: ele chega à validação da foto', async () => {
      const response = await post(author, payloadWithPhoto('A'.repeat(1_000_000)));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: [{ field: 'photo.content', message: 'A foto precisa ser uma imagem JPEG.' }],
      });
    });

    it('deve responder 413 a um corpo de 4 MB em /api/reports, no formato de erro da aplicação', async () => {
      const response = await post(author, payloadWithPhoto('A'.repeat(4 * 1024 * 1024)));

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'O corpo da requisição passa do limite de 2,8 MB.',
      });
    });

    it('deve continuar respondendo 413 a um corpo de 200 KB numa rota de usuários', async () => {
      const response = await e2e
        .api()
        .post('/api/clients')
        .send({ ...buildClientPayload(), name: 'a'.repeat(200 * 1024) });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'O corpo da requisição passa do limite de 100 KB.',
      });
    });

    it('deve responder 400 ao JSON malformado, sem repetir o corpo na mensagem', async () => {
      const response = await e2e
        .api()
        .post('/api/reports')
        .auth(author.accessToken, BEARER)
        .set('content-type', 'application/json')
        .send(`{"photo": {"content": "${fixtureBase64('report-photo.jpg').slice(0, 40)}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: INVALID_JSON_MESSAGE,
      });
    });
  });

  describe('abertura (T4)', () => {
    it('deve gravar a foto sem os metadados e responder as dimensões da imagem', async () => {
      const client = await e2e.registerVerifiedClient();
      const original = readFileSync(join(__dirname, 'fixtures', 'report-photo-metadata.jpg'));

      const response = await post(client, payloadWithPhoto(original.toString('base64')));

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ photo: { width: 160, height: 120 } });
      const stored = await e2e.storedReportPhoto((response.body as { id: string }).id);
      expect(jpegHeaderMarkers(original)).toEqual(expect.arrayContaining([0xe1, 0xed]));
      expect(jpegHeaderMarkers(stored)).not.toContain(0xe1);
      expect(jpegHeaderMarkers(stored)).not.toContain(0xed);
      expect(stored.toString('latin1')).not.toContain('GPSLatitude');
    });

    it('deve recusar a Idempotency-Key que não é UUID com 400 e o nome do header', async () => {
      const response = await post(author, buildReportPayload(), { 'Idempotency-Key': 'chave-1' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: [{ field: 'Idempotency-Key', message: 'A Idempotency-Key deve ser um UUID.' }],
      });
    });

    it('deve criar um reporte só com pedidos simultâneos com a mesma chave', async () => {
      const client = await e2e.registerVerifiedClient();
      const headers = { 'Idempotency-Key': randomUUID() };

      const responses = await Promise.all([
        post(client, buildReportPayload(), headers),
        post(client, buildReportPayload(), headers),
        post(client, buildReportPayload(), headers),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
      expect(new Set(responses.map(({ body }) => (body as { id: string }).id)).size).toBe(1);
      await expect(e2e.countReports(client.id)).resolves.toBe(1);
    });

    it('deve aceitar a Idempotency-Key em maiúsculas como a mesma chave', async () => {
      const client = await e2e.registerVerifiedClient();
      const key = randomUUID();
      const first = await post(client, buildReportPayload(), { 'Idempotency-Key': key });

      const second = await post(client, buildReportPayload(), {
        'Idempotency-Key': key.toUpperCase(),
      });

      expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id);
    });
  });

  describe('consultas (T5)', () => {
    let reportId: string;

    beforeAll(async () => {
      reportId = (await e2e.openReport(author)).id;
    });

    it.each([
      ['a latitude fora da faixa', '?latitude=-91&longitude=-52.37', 'latitude'],
      [
        'o raio acima de 5000',
        `?latitude=${CAMPO_MOURAO.latitude}&longitude=${CAMPO_MOURAO.longitude}&radiusMeters=5001`,
        'radiusMeters',
      ],
      ['a longitude ausente', '?latitude=-24.04', 'longitude'],
    ])('deve recusar %s com 400', async (_case, query, field) => {
      const response = await get(other, `/reports/nearby${query}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ details: [{ field }] });
    });

    it.each(['/reports/nao-e-uuid', '/reports/nao-e-uuid/photo'])(
      'deve validar o id como UUID em %s',
      async (path) => {
        const response = await get(other, path);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ details: [{ field: 'id' }] });
      },
    );

    it('deve responder a miniatura em base64 com size=thumbnail', async () => {
      const response = await get(other, `/reports/${reportId}/photo?size=thumbnail`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: expect.any(String) as string,
        mimeType: 'image/jpeg',
        content: fixtureBase64('report-thumbnail.jpg'),
      });
    });

    it('deve responder 404 no detalhe e na foto do reporte REJECTED de outro autor, e 200 ao autor', async () => {
      const rejected = await e2e.openReport(author);
      await e2e.updateReportVoting(rejected.id, { status: 'REJECTED', rejectionsCount: 10 });

      const responses = await Promise.all([
        get(other, `/reports/${rejected.id}`),
        get(other, `/reports/${rejected.id}/photo`),
        get(author, `/reports/${rejected.id}`),
        get(author, `/reports/${rejected.id}/photo`),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([404, 404, 200, 200]);
      expect(responses[0].body).toMatchObject({ message: 'Reporte não encontrado.' });
    });

    it('não deve trazer o id, o nome ou o e-mail do autor em nenhuma resposta', async () => {
      const nearby = `/reports/nearby?latitude=${CAMPO_MOURAO.latitude}&longitude=${CAMPO_MOURAO.longitude}`;

      const responses = await Promise.all([
        get(other, `/reports/${reportId}`),
        get(other, nearby),
        get(author, '/reports/mine'),
        get(author, `/reports/${reportId}`),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.text).not.toContain(author.id);
        expect(response.text).not.toContain(author.email);
        expect(response.text).not.toContain('Maria da Silva');
      }
    });
  });

  describe('edição e exclusão (T6)', () => {
    it('deve responder 422 ao editar um reporte com uma confirmação', async () => {
      const { id } = await e2e.openReport(author);
      await e2e.updateReportVoting(id, { confirmationsCount: 1 });

      const response = await patch(author, id, { description: 'Nova' });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'O reporte já recebeu votos e não pode mais ser editado.',
      });
    });

    it('deve responder 422 ao editar e ao excluir um reporte CONFIRMED', async () => {
      const { id } = await e2e.openReport(author);
      await e2e.updateReportVoting(id, { status: 'CONFIRMED', confirmationsCount: 10 });

      const edit = await patch(author, id, { description: 'Nova' });
      const deletion = await remove(author, id);

      expect(edit.status).toBe(422);
      expect(edit.body).toMatchObject({ message: 'Só é possível editar um reporte em validação.' });
      expect(deletion.status).toBe(422);
      expect(deletion.body).toMatchObject({
        message: 'Só é possível excluir um reporte em validação.',
      });
    });

    it('deve responder 403 a quem vê o reporte de outro autor e 404 a quem não vê', async () => {
      const visible = await e2e.openReport(author);
      const hidden = await e2e.openReport(author);
      await e2e.updateReportVoting(hidden.id, { status: 'REJECTED' });

      const responses = await Promise.all([
        patch(other, visible.id, { description: 'Nova' }),
        remove(other, visible.id),
        patch(other, hidden.id, { description: 'Nova' }),
        remove(other, hidden.id),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([403, 403, 404, 404]);
    });

    it('deve aplicar as regras da foto também no PATCH', async () => {
      const { id } = await e2e.openReport(author);

      const response = await patch(author, id, {
        photo: {
          content: fixtureBase64('photo.png'),
          thumbnail: fixtureBase64('report-thumbnail.jpg'),
        },
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ details: [{ field: 'photo.content' }] });
    });

    it('deve exigir a descrição ou a foto no PATCH', async () => {
      const { id } = await e2e.openReport(author);

      const response = await patch(author, id, {
        location: { ...CAMPO_MOURAO, accuracyMeters: 5 },
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        details: [{ field: 'body', message: 'Informe a descrição ou a foto.' }],
      });
    });
  });

  // Por último: confere o log de todas as requisições do arquivo, inclusive as recusadas.
  it('não deve escrever a foto, o base64 nem as coordenadas no log (RN36)', () => {
    const log = logger.lines.join('\n');

    expect(logger.lines.length).toBeGreaterThan(0);
    expect(log).not.toContain(fixtureBase64('report-photo.jpg').slice(0, 40));
    expect(log).not.toContain(fixtureBase64('report-thumbnail.jpg').slice(0, 40));
    expect(log).not.toContain(String(CAMPO_MOURAO.latitude));
    expect(log).not.toContain(String(CAMPO_MOURAO.longitude));
  });
});
