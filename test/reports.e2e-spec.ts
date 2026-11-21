import { randomUUID } from 'node:crypto';

import type request from 'supertest';

import {
  Actor,
  buildReportPayload,
  CAMPO_MOURAO,
  E2eApp,
  fixtureBase64,
  REPORT_PHOTO_FIXTURE,
  REPORT_THUMBNAIL_FIXTURE,
  Tokens,
} from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

/** Reporte como a API responde. */
interface ReportBody {
  id: string;
  status: string;
  description: string | null;
  location: { latitude: number; longitude: number; accuracyMeters: number };
  photo: { id: string; width: number; height: number };
  votes: Record<string, number | string | null>;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  distanceMeters?: number;
}

const NEARBY = `/reports/nearby?latitude=${CAMPO_MOURAO.latitude}&longitude=${CAMPO_MOURAO.longitude}&radiusMeters=30`;

describe('Reportes (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function open(
    session: Tokens,
    body: object = buildReportPayload(),
    headers: Record<string, string> = {},
  ): request.Test {
    return e2e.api().post('/api/reports').auth(session.accessToken, BEARER).set(headers).send(body);
  }

  function get(session: Tokens, path: string): request.Test {
    return e2e.api().get(`/api${path}`).auth(session.accessToken, BEARER);
  }

  /** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
  describe('Abrir → listar → detalhe → foto → editar → excluir, com o mesmo Client', () => {
    let client: Actor;
    let report: ReportBody;

    beforeAll(async () => {
      client = await e2e.registerVerifiedClient();
    });

    it('deve abrir o reporte PENDING, com a foto e a localização', async () => {
      const response = await open(client);

      expect(response.status).toBe(201);
      report = response.body as ReportBody;
      expect(report).toMatchObject({
        status: 'PENDING',
        description: 'Buraco grande na faixa da direita, perto do semáforo.',
        location: { ...CAMPO_MOURAO, accuracyMeters: 9 },
        photo: { width: 160, height: 120 },
        // O .env.test deixa as duas contagens em 3 (o padrão é 10).
        votes: {
          confirmations: 0,
          rejections: 0,
          confirmationsRequired: 3,
          rejectionsRequired: 3,
          mine: null,
        },
        isMine: true,
        canEdit: true,
        canDelete: true,
        canVote: false,
        statusChangedAt: null,
      });
    });

    it('deve listar o reporte entre os do Client', async () => {
      const response = await get(client, '/reports/mine');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect((response.body as { items: ReportBody[] }).items.map(({ id }) => id)).toEqual([
        report.id,
      ]);
    });

    it('deve mostrar o detalhe do reporte', async () => {
      const response = await get(client, `/reports/${report.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(report);
    });

    it('deve devolver a foto e a miniatura em base64', async () => {
      const [full, thumbnail] = await Promise.all([
        get(client, `/reports/${report.id}/photo`),
        get(client, `/reports/${report.id}/photo?size=thumbnail`),
      ]);

      expect(full.body).toEqual({
        id: report.photo.id,
        mimeType: 'image/jpeg',
        content: fixtureBase64(REPORT_PHOTO_FIXTURE),
      });
      expect(thumbnail.body).toMatchObject({ content: fixtureBase64(REPORT_THUMBNAIL_FIXTURE) });
    });

    it('deve editar só a descrição e manter a foto', async () => {
      const response = await e2e
        .api()
        .patch(`/api/reports/${report.id}`)
        .auth(client.accessToken, BEARER)
        .send({ description: '  Buraco no meio da faixa.  ' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        description: 'Buraco no meio da faixa.',
        photo: report.photo,
      });
    });

    it('deve trocar só a foto, com outro id, e manter a descrição', async () => {
      const response = await e2e
        .api()
        .patch(`/api/reports/${report.id}`)
        .auth(client.accessToken, BEARER)
        .send({
          photo: {
            content: fixtureBase64('report-photo-progressive.jpg'),
            thumbnail: fixtureBase64(REPORT_THUMBNAIL_FIXTURE),
          },
        });

      expect(response.status).toBe(200);
      const edited = response.body as ReportBody;
      expect(edited).toMatchObject({
        description: 'Buraco no meio da faixa.',
        photo: { width: 200, height: 150 },
      });
      expect(edited.photo.id).not.toBe(report.photo.id);
      const photo = await get(client, `/reports/${report.id}/photo`);
      expect(photo.body).toEqual({
        id: edited.photo.id,
        mimeType: 'image/jpeg',
        content: fixtureBase64('report-photo-progressive.jpg'),
      });
    });

    it('deve apagar a descrição com o texto vazio', async () => {
      const response = await e2e
        .api()
        .patch(`/api/reports/${report.id}`)
        .auth(client.accessToken, BEARER)
        .send({ description: '' });

      expect(response.body).toMatchObject({ description: null });
    });

    it('deve excluir o reporte, que some de todas as rotas', async () => {
      const response = await e2e
        .api()
        .delete(`/api/reports/${report.id}`)
        .auth(client.accessToken, BEARER);

      expect(response.status).toBe(204);
      const [mine, nearby, detail, photo] = await Promise.all([
        get(client, '/reports/mine'),
        get(client, NEARBY),
        get(client, `/reports/${report.id}`),
        get(client, `/reports/${report.id}/photo`),
      ]);
      expect(mine.body).toMatchObject({ total: 0, items: [] });
      expect((nearby.body as { items: ReportBody[] }).items.map(({ id }) => id)).not.toContain(
        report.id,
      );
      expect([detail.status, photo.status]).toEqual([404, 404]);
    });

    it('deve continuar contando o reporte excluído', async () => {
      await expect(e2e.countReports(client.id)).resolves.toBe(1);
    });
  });

  describe('E-mail verificado (RN26)', () => {
    it('deve recusar o Client com o e-mail não verificado e aceitar o mesmo pedido depois da confirmação', async () => {
      const client = await e2e.registerClient();

      const refused = await open(client);
      await e2e.confirmEmail(client);
      const accepted = await open(client);

      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ message: 'Confirme o seu e-mail para abrir reportes.' });
      expect(accepted.status).toBe(201);
    });
  });

  describe('Regras da abertura', () => {
    let client: Actor;
    /** Chave do primeiro reporte do Client, repetida no limite por dia. */
    let idempotencyKey: string;

    beforeAll(async () => {
      client = await e2e.registerVerifiedClient();
    });

    it('deve recusar o lugar fora de Campo Mourão', async () => {
      const response = await open(
        client,
        buildReportPayload({
          location: { latitude: -25.4284, longitude: -49.2733, accuracyMeters: 5 },
        }),
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: 'Este lugar fica fora de Campo Mourão.' });
    });

    it('deve recusar a localização imprecisa', async () => {
      const response = await open(
        client,
        buildReportPayload({ location: { ...CAMPO_MOURAO, accuracyMeters: 120 } }),
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'A localização está imprecisa. Tente de novo num lugar aberto.',
      });
    });

    it('deve devolver o mesmo reporte para a mesma Idempotency-Key, sem criar outro', async () => {
      idempotencyKey = randomUUID();
      const headers = { 'Idempotency-Key': idempotencyKey };

      const first = await open(client, buildReportPayload(), headers);
      const repeated = await open(client, buildReportPayload(), headers);

      expect([first.status, repeated.status]).toEqual([201, 201]);
      expect((repeated.body as ReportBody).id).toBe((first.body as ReportBody).id);
      await expect(e2e.countReports(client.id)).resolves.toBe(1);
    });

    it('deve recusar o 11º reporte em 24 horas, contando o excluído', async () => {
      const deleted = await e2e.openReport(client);
      await e2e.api().delete(`/api/reports/${deleted.id}`).auth(client.accessToken, BEARER);
      // Com o da chave e o excluído, o Client tem 2 reportes: faltam 8 para o limite de 10.
      for (let index = 0; index < 8; index++) {
        await e2e.openReport(client);
      }

      const response = await open(client, buildReportPayload(), {
        'Idempotency-Key': randomUUID(),
      });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'Você chegou ao limite de 10 reportes por dia.',
      });
      await expect(e2e.countReports(client.id)).resolves.toBe(10);
    });

    it('deve devolver o reporte da chave repetida mesmo no limite por dia', async () => {
      const response = await open(client, buildReportPayload(), {
        'Idempotency-Key': idempotencyKey,
      });

      expect(response.status).toBe(201);
      await expect(e2e.countReports(client.id)).resolves.toBe(10);
    });
  });

  describe('Visibilidade entre dois Clients (RN35)', () => {
    let author: Actor;
    let other: Actor;
    let report: ReportBody;

    beforeAll(async () => {
      author = await e2e.registerVerifiedClient();
      other = await e2e.registerClient();
      report = (await open(author)).body as ReportBody;
    });

    it('deve mostrar o reporte PENDING ao outro Client, sem as ações do autor', async () => {
      const [detail, nearby, mine] = await Promise.all([
        get(other, `/reports/${report.id}`),
        get(other, NEARBY),
        get(other, '/reports/mine'),
      ]);

      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        id: report.id,
        isMine: false,
        canEdit: false,
        canDelete: false,
        canVote: true,
      });
      expect((nearby.body as { items: ReportBody[] }).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: report.id, distanceMeters: 0 })]),
      );
      expect(mine.body).toMatchObject({ total: 0 });
    });

    it('deve responder 403 ao outro Client que tenta editar ou excluir', async () => {
      const [edit, deletion] = await Promise.all([
        e2e
          .api()
          .patch(`/api/reports/${report.id}`)
          .auth(other.accessToken, BEARER)
          .send({ description: 'x' }),
        e2e.api().delete(`/api/reports/${report.id}`).auth(other.accessToken, BEARER),
      ]);

      expect([edit.status, deletion.status]).toEqual([403, 403]);
    });

    it('deve esconder do outro Client o reporte REJECTED, que o autor continua vendo', async () => {
      await e2e.updateReportVoting(report.id, { status: 'REJECTED', rejectionsCount: 10 });

      const [forOther, inNearby, forAuthor] = await Promise.all([
        get(other, `/reports/${report.id}`),
        get(other, NEARBY),
        get(author, `/reports/${report.id}`),
      ]);

      expect(forOther.status).toBe(404);
      expect((inNearby.body as { items: ReportBody[] }).items.map(({ id }) => id)).not.toContain(
        report.id,
      );
      expect(forAuthor.status).toBe(200);
      expect(forAuthor.body).toMatchObject({
        status: 'REJECTED',
        canEdit: false,
        canDelete: false,
      });
    });
  });

  describe('Limite do corpo', () => {
    it('deve responder 413 ao corpo acima do limite das rotas de reportes', async () => {
      const client = await e2e.registerVerifiedClient();
      const payload = buildReportPayload();

      const response = await open(client, {
        ...payload,
        photo: { ...payload.photo, content: 'A'.repeat(4 * 1024 * 1024) },
      });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ statusCode: 413, error: 'Payload Too Large' });
    });
  });
});
