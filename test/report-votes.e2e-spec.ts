import type request from 'supertest';

import { pointNorthOf } from '@modules/reports/testing/report-fixtures';

import { Actor, buildVotePayload, CAMPO_MOURAO, E2eApp, Tokens } from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;

/** Reporte como a API responde. */
interface ReportBody {
  id: string;
  status: string;
  votes: {
    confirmations: number;
    rejections: number;
    confirmationsRequired: number;
    rejectionsRequired: number;
    mine: string | null;
  };
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canVote: boolean;
  statusChangedAt: string | null;
}

const NEARBY = `/reports/nearby?latitude=${CAMPO_MOURAO.latitude}&longitude=${CAMPO_MOURAO.longitude}&radiusMeters=100`;

/**
 * Validação comunitária de ponta a ponta (docs/sprints/sprint-4-reportes.md, RN37 a RN40),
 * contra o MySQL de teste e o SuperTokens Core. O `.env.test` deixa as duas contagens em 3, para
 * criar menos contas: a regra com 10 fica nos testes unitários.
 */
describe('Validação comunitária dos reportes (e2e)', () => {
  let e2e: E2eApp;
  let author: Actor;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
    author = await e2e.registerVerifiedClient();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function get(session: Tokens, path: string): request.Test {
    return e2e.api().get(`/api${path}`).auth(session.accessToken, BEARER);
  }

  function nearbyIds(response: request.Response): string[] {
    return (response.body as { items: ReportBody[] }).items.map(({ id }) => id);
  }

  /** Os passos rodam em ordem, e cada um parte do estado deixado pelo anterior. */
  describe('Confirmar até CONFIRMED', () => {
    let reportId: string;
    let voters: Actor[];

    beforeAll(async () => {
      reportId = (await e2e.openReport(author)).id;
      voters = await e2e.registerVerifiedClients(4);
    });

    it('deve mostrar o reporte em validação com o canVote para quem ainda não votou', async () => {
      const response = await get(voters[0], `/reports/${reportId}`);

      expect(response.body).toMatchObject({
        status: 'PENDING',
        votes: { confirmations: 0, confirmationsRequired: 3, rejectionsRequired: 3, mine: null },
        canVote: true,
      });
    });

    it('deve somar a confirmação e responder 201 com o voto do usuário', async () => {
      const response = await e2e.vote(voters[0], reportId);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: reportId,
        status: 'PENDING',
        votes: { confirmations: 1, rejections: 0, mine: 'CONFIRM' },
        isMine: false,
        canVote: false,
        statusChangedAt: null,
      });
    });

    it('deve mostrar o voto no detalhe e no nearby de quem votou', async () => {
      const [detail, nearby] = await Promise.all([
        get(voters[0], `/reports/${reportId}`),
        get(voters[0], NEARBY),
      ]);

      expect(detail.body).toMatchObject({ votes: { mine: 'CONFIRM' }, canVote: false });
      expect((nearby.body as { items: ReportBody[] }).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: reportId,
            votes: expect.objectContaining({ mine: 'CONFIRM' }) as object,
            canVote: false,
          }),
        ]),
      );
    });

    it('deve recusar a edição do autor depois do primeiro voto (RN33)', async () => {
      const response = await e2e
        .api()
        .patch(`/api/reports/${reportId}`)
        .auth(author.accessToken, BEARER)
        .send({ description: 'Nova descrição.' });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'O reporte já recebeu votos e não pode mais ser editado.',
      });
    });

    it('deve confirmar o reporte na 3ª confirmação, com a data da mudança', async () => {
      await e2e.voteWithEach([voters[1]], reportId);

      const response = await e2e.vote(voters[2], reportId);

      expect(response.status).toBe(201);
      const report = response.body as ReportBody;
      expect(report).toMatchObject({ status: 'CONFIRMED', votes: { confirmations: 3 } });
      expect(report.statusChangedAt).toEqual(expect.any(String));
    });

    it('deve recusar o voto seguinte, que não muda o reporte', async () => {
      const response = await e2e.vote(voters[3], reportId, buildVotePayload({ vote: 'DENY' }));

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: 'Este reporte não está mais em validação.' });
      const detail = await get(author, `/reports/${reportId}`);
      expect(detail.body).toMatchObject({
        status: 'CONFIRMED',
        votes: { confirmations: 3, rejections: 0, mine: null },
        isMine: true,
        canEdit: false,
        canDelete: false,
        canVote: false,
      });
    });

    it('deve continuar mostrando o reporte CONFIRMED aos outros cidadãos', async () => {
      const response = await get(voters[3], NEARBY);

      expect(nearbyIds(response)).toContain(reportId);
    });
  });

  describe('Negar até REJECTED', () => {
    it('deve descartar o reporte com 3 votos "não está lá", que some para quem não é o autor', async () => {
      const { id } = await e2e.openReport(author);
      const voters = await e2e.registerVerifiedClients(3);

      const last = await e2e.voteWithEach(voters, id, buildVotePayload({ vote: 'DENY' }));

      expect(last).toMatchObject({ status: 'REJECTED', votes: { rejections: 3, mine: 'DENY' } });
      const [forVoter, inNearby, forAuthor] = await Promise.all([
        get(voters[0], `/reports/${id}`),
        get(voters[0], NEARBY),
        get(author, `/reports/${id}`),
      ]);
      expect(forVoter.status).toBe(404);
      expect(nearbyIds(inNearby)).not.toContain(id);
      expect(forAuthor.status).toBe(200);
      expect(forAuthor.body).toMatchObject({ status: 'REJECTED', votes: { rejections: 3 } });
    });
  });

  describe('Regras do voto', () => {
    let voter: Actor;

    beforeAll(async () => {
      voter = await e2e.registerVerifiedClient();
    });

    it('deve recusar o voto repetido com 409', async () => {
      const { id } = await e2e.openReport(author);
      await e2e.voteWithEach([voter], id);

      const response = await e2e.vote(voter, id, buildVotePayload({ vote: 'DENY' }));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ message: 'Você já votou neste reporte.' });
      const detail = await get(voter, `/reports/${id}`);
      expect(detail.body).toMatchObject({ votes: { confirmations: 1, rejections: 0 } });
    });

    it('deve recusar o voto do autor no próprio reporte', async () => {
      const { id } = await e2e.openReport(author);

      const response = await e2e.vote(author, id);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ message: 'Você não pode votar no próprio reporte.' });
    });

    it('deve recusar quem está a 600 m do reporte', async () => {
      const { id } = await e2e.openReport(author);

      const response = await e2e.vote(
        voter,
        id,
        buildVotePayload({ location: { ...pointNorthOf(CAMPO_MOURAO, 600), accuracyMeters: 5 } }),
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'Você precisa estar a até 500 m do reporte para votar.',
      });
    });

    it('deve recusar a localização imprecisa com a mensagem da abertura', async () => {
      const { id } = await e2e.openReport(author);

      const response = await e2e.vote(
        voter,
        id,
        buildVotePayload({ location: { ...CAMPO_MOURAO, accuracyMeters: 80 } }),
      );

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        message: 'A localização está imprecisa. Tente de novo num lugar aberto.',
      });
    });

    it('deve recusar o Client com o e-mail não verificado e aceitar o mesmo voto depois da confirmação', async () => {
      const { id } = await e2e.openReport(author);
      const client = await e2e.registerClient();

      const refused = await e2e.vote(client, id);
      await e2e.confirmEmail(client);
      const accepted = await e2e.vote(client, id);

      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({
        message: 'Confirme o seu e-mail para votar nos reportes.',
      });
      expect(accepted.status).toBe(201);
    });

    it('deve responder 404 ao voto num reporte excluído', async () => {
      const { id } = await e2e.openReport(author);
      await e2e.api().delete(`/api/reports/${id}`).auth(author.accessToken, BEARER);

      const response = await e2e.vote(voter, id);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ message: 'Reporte não encontrado.' });
    });

    it('deve deixar o autor excluir o reporte com votos, enquanto ele está em validação', async () => {
      const { id } = await e2e.openReport(author);
      await e2e.voteWithEach([voter], id);

      const response = await e2e
        .api()
        .delete(`/api/reports/${id}`)
        .auth(author.accessToken, BEARER);

      expect(response.status).toBe(204);
    });
  });

  describe('Votos simultâneos pela API (RN40)', () => {
    it('deve contar os votos um a um e mudar o status uma vez só', async () => {
      const { id } = await e2e.openReport(author);
      const voters = await e2e.registerVerifiedClients(5);

      const responses = await Promise.all(voters.map((voter) => e2e.vote(voter, id)));

      const accepted = responses.filter(({ status }) => status === 201);
      const reports = accepted.map(({ body }) => body as ReportBody);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 201, 201, 422, 422]);
      expect(reports.map(({ votes }) => votes.confirmations).sort()).toEqual([1, 2, 3]);
      expect(reports.filter(({ status }) => status === 'CONFIRMED')).toHaveLength(1);
      const detail = await get(author, `/reports/${id}`);
      expect(detail.body).toMatchObject({ status: 'CONFIRMED', votes: { confirmations: 3 } });
    });
  });
});
