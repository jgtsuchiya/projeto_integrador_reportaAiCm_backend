import type request from 'supertest';

import { Role, ROLES } from '@modules/users/domain/value-objects/role';

import {
  Actor,
  buildClientPayload,
  E2eApp,
  InvitedAdmin,
  newEmail,
  PASSWORD,
  readTokens,
  Tokens,
} from './support/e2e-app';

const BEARER = { type: 'bearer' } as const;
const STAFF = [Role.SUPER_ADMIN, Role.ADMIN] as const;

interface Call {
  /** Quem chama. Sem ator, a requisição vai sem sessão. */
  actor?: Actor;
  /**
   * Se o papel de quem chama passa pela rota. A chamada permitida que consome o alvo (ou a
   * sessão de quem chama) usa um descartável, para um teste não depender da ordem dos outros.
   */
  allowed: boolean;
}

interface RouteCase {
  route: string;
  allowed: readonly Role[];
  /** Status da resposta para quem tem permissão. */
  success: number;
  /**
   * Papéis com permissão que param numa regra da própria rota, e o status dela. A resposta
   * mostra que eles passaram pela autorização: quem não tem permissão recebe 403.
   */
  refused?: Partial<Record<Role, number>>;
  /**
   * A rota aceita a sessão pendente, de quem ainda não conferiu o código da segunda etapa
   * (RN25). O padrão é recusá-la com o 403 `invalid claim`.
   */
  acceptsPending?: boolean;
  send: (call: Call) => PromiseLike<request.Response>;
}

/**
 * Matriz de permissões (docs/sprints/sprint-2-usuarios.md e docs/sprints/sprint-3-login.md,
 * seção 4): cada rota protegida é chamada sem sessão (401), com cada papel (o status de
 * sucesso ou 403) e com uma sessão pendente (403 `invalid claim`, menos nas rotas que a
 * aceitam).
 */
describe('Matriz de permissões (e2e)', () => {
  let e2e: E2eApp;
  let actors: Record<Role, Actor>;
  /** Alvos das chamadas barradas e das permitidas que não os alteram. */
  let targets: { admin: Actor; pendingAdmin: InvitedAdmin; client: Actor };
  /** Sessão pendente de um Client criado só para isso: nenhum teste a conclui nem a encerra. */
  let pendingSession: Actor;

  beforeAll(async () => {
    e2e = await E2eApp.start();

    const superAdmin = await e2e.seedSuperAdmin();
    actors = {
      [Role.SUPER_ADMIN]: superAdmin,
      [Role.ADMIN]: await e2e.createAdmin(superAdmin),
      [Role.CLIENT]: await e2e.registerClient(),
    };
    targets = {
      admin: await e2e.createAdmin(superAdmin),
      pendingAdmin: await e2e.inviteAdmin(superAdmin),
      client: await e2e.registerClient(),
    };
    pendingSession = await e2e.logInPending(await e2e.registerClient());
  });

  afterAll(async () => {
    await e2e?.close();
  });

  function call(
    actor: Tokens | undefined,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
  ): request.Test {
    const test = e2e.api()[method](`/api${path}`);
    const authenticated = actor ? test.auth(actor.accessToken, BEARER) : test;

    return body ? authenticated.send(body) : authenticated;
  }

  const matrix: ReadonlyArray<{ line: string; routes: readonly RouteCase[] }> = [
    {
      line: 'Logout, ver e editar o próprio perfil, trocar a senha (autenticado)',
      routes: [
        {
          route: 'POST /api/auth/signout',
          allowed: ROLES,
          success: 200,
          acceptsPending: true,
          // Sai de uma sessão aberta só para isso: a compartilhada continua valendo.
          send: async ({ actor }) =>
            call(actor && (await e2e.logIn(actor)), 'post', '/auth/signout'),
        },
        {
          route: 'GET /api/users/me',
          allowed: ROLES,
          success: 200,
          send: ({ actor }) => call(actor, 'get', '/users/me'),
        },
        {
          route: 'PATCH /api/users/me',
          allowed: ROLES,
          success: 200,
          send: ({ actor }) => call(actor, 'patch', '/users/me', { name: 'Nome Editado' }),
        },
        {
          route: 'PATCH /api/users/me/password',
          allowed: ROLES,
          success: 204,
          // A nova senha repete a atual, para a conta continuar servindo aos outros testes.
          send: ({ actor }) =>
            call(actor, 'patch', '/users/me/password', {
              currentPassword: PASSWORD,
              newPassword: PASSWORD,
            }),
        },
      ],
    },
    {
      line: 'Reenviar a verificação do próprio e-mail (autenticado)',
      routes: [
        {
          route: 'POST /api/users/me/email-verification',
          allowed: ROLES,
          success: 204,
          // O SUPER_ADMIN e o ADMIN já nascem com o e-mail verificado (RN22).
          refused: { [Role.SUPER_ADMIN]: 422, [Role.ADMIN]: 422 },
          send: async ({ actor }) => {
            // O Client recebeu o link no cadastro: o reenvio espera o intervalo de 1 minuto.
            if (actor?.id === actors.CLIENT.id) {
              await e2e.passResendInterval(actor.id);
            }

            return call(actor, 'post', '/users/me/email-verification');
          },
        },
      ],
    },
    {
      line: 'Listar e encerrar as próprias sessões (autenticado)',
      routes: [
        {
          route: 'GET /api/users/me/sessions',
          allowed: ROLES,
          success: 200,
          send: ({ actor }) => call(actor, 'get', '/users/me/sessions'),
        },
        {
          route: 'DELETE /api/users/me/sessions/:id',
          allowed: ROLES,
          success: 204,
          send: async ({ actor }) => {
            // Encerra uma sessão aberta só para isso: a compartilhada continua valendo.
            const id = actor ? await e2e.currentSessionId(await e2e.logIn(actor)) : 'sem-sessao';

            return call(actor, 'delete', `/users/me/sessions/${id}`);
          },
        },
        {
          route: 'DELETE /api/users/me/sessions',
          allowed: ROLES,
          success: 204,
          // Encerra as outras sessões da conta e mantém a de quem chama, que é a compartilhada.
          send: ({ actor }) => call(actor, 'delete', '/users/me/sessions'),
        },
      ],
    },
    {
      line: 'Ativar e desativar a verificação em duas etapas (autenticado)',
      routes: [
        {
          route: 'PATCH /api/users/me/mfa',
          allowed: ROLES,
          success: 200,
          // Desativa o que já está desativado, o que responde 200 sem efeito. Ativar revogaria
          // as outras sessões da conta, e os logins seguintes pediriam o código.
          send: ({ actor }) =>
            call(actor, 'patch', '/users/me/mfa', { enabled: false, password: PASSWORD }),
        },
      ],
    },
    {
      line: 'Receber e conferir o código da segunda etapa (sessão pendente)',
      routes: [
        {
          route: 'POST /api/mfa/verify',
          allowed: ROLES,
          success: 204,
          acceptsPending: true,
          // A sessão é aberta só para isso, e fica pendente: a senha já foi conferida, e o
          // código ainda não.
          send: async ({ actor }) => {
            const pending = actor && (await e2e.logInPending(actor));

            return call(pending, 'post', '/mfa/verify', {
              code: actor ? e2e.lastLoginCode(actor.email) : '000000',
            });
          },
        },
        {
          route: 'POST /api/mfa/code',
          allowed: ROLES,
          success: 204,
          acceptsPending: true,
          send: async ({ actor }) => {
            const pending = actor && (await e2e.logInPending(actor));
            // O login acabou de enviar um código: o reenvio espera o intervalo de 1 minuto.
            if (actor) {
              await e2e.passResendInterval(actor.id);
            }

            return call(pending, 'post', '/mfa/code');
          },
        },
      ],
    },
    {
      line: 'Excluir a própria conta (CLIENT)',
      routes: [
        {
          route: 'DELETE /api/users/me',
          allowed: [Role.CLIENT],
          success: 204,
          // Quem se exclui é um Client criado só para isso.
          send: async ({ actor, allowed }) =>
            call(allowed ? await e2e.registerClient() : actor, 'delete', '/users/me', {
              password: PASSWORD,
            }),
        },
      ],
    },
    {
      line: 'Convidar, listar, editar, inativar e excluir ADMs (SUPER_ADMIN)',
      routes: [
        {
          route: 'POST /api/admins',
          allowed: [Role.SUPER_ADMIN],
          success: 201,
          send: ({ actor }) =>
            call(actor, 'post', '/admins', { name: 'Ana Souza', email: newEmail('admin') }),
        },
        {
          route: 'GET /api/admins',
          allowed: [Role.SUPER_ADMIN],
          success: 200,
          send: ({ actor }) => call(actor, 'get', '/admins'),
        },
        {
          route: 'GET /api/admins/:id',
          allowed: [Role.SUPER_ADMIN],
          success: 200,
          send: ({ actor }) => call(actor, 'get', `/admins/${targets.admin.id}`),
        },
        {
          route: 'PATCH /api/admins/:id',
          allowed: [Role.SUPER_ADMIN],
          success: 200,
          send: ({ actor }) =>
            call(actor, 'patch', `/admins/${targets.admin.id}`, { name: 'Ana Lima' }),
        },
        {
          route: 'PATCH /api/admins/:id/status',
          allowed: [Role.SUPER_ADMIN],
          success: 200,
          send: async ({ actor, allowed }) => {
            const admin = allowed ? await e2e.createAdmin(actors.SUPER_ADMIN) : targets.admin;

            return call(actor, 'patch', `/admins/${admin.id}/status`, { status: 'INACTIVE' });
          },
        },
        {
          route: 'POST /api/admins/:id/invitation',
          allowed: [Role.SUPER_ADMIN],
          success: 200,
          send: ({ actor }) => call(actor, 'post', `/admins/${targets.pendingAdmin.id}/invitation`),
        },
        {
          route: 'DELETE /api/admins/:id',
          allowed: [Role.SUPER_ADMIN],
          success: 204,
          send: async ({ actor, allowed }) => {
            const admin = allowed
              ? await e2e.inviteAdmin(actors.SUPER_ADMIN)
              : targets.pendingAdmin;

            return call(actor, 'delete', `/admins/${admin.id}`);
          },
        },
      ],
    },
    {
      line: 'Listar, consultar, inativar e reativar Clients (ADMIN e SUPER_ADMIN)',
      routes: [
        {
          route: 'GET /api/clients',
          allowed: STAFF,
          success: 200,
          send: ({ actor }) => call(actor, 'get', '/clients'),
        },
        {
          route: 'GET /api/clients/:id',
          allowed: STAFF,
          success: 200,
          send: ({ actor }) => call(actor, 'get', `/clients/${targets.client.id}`),
        },
        {
          route: 'PATCH /api/clients/:id/status',
          allowed: STAFF,
          success: 200,
          send: async ({ actor, allowed }) => {
            const client = allowed ? await e2e.registerClient() : targets.client;

            return call(actor, 'patch', `/clients/${client.id}/status`, { status: 'INACTIVE' });
          },
        },
      ],
    },
  ];

  describe('Autocadastro de Client, login, refresh, aceite de convite, redefinição de senha e confirmação do e-mail (público)', () => {
    it('deve cadastrar um Client sem sessão', async () => {
      const response = await call(undefined, 'post', '/clients', buildClientPayload());

      expect(response.status).toBe(201);
    });

    it('deve fazer login sem sessão', async () => {
      const response = await e2e.signIn(actors.CLIENT.email, PASSWORD);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'OK' });
    });

    it('deve renovar a sessão só com o refresh token', async () => {
      const { refreshToken } = await e2e.logIn(actors.CLIENT);

      const response = await e2e.refresh(refreshToken);

      expect(response.status).toBe(200);
    });

    it('deve aceitar um convite sem sessão', async () => {
      const { token } = await e2e.inviteAdmin(actors.SUPER_ADMIN);

      const response = await call(undefined, 'post', '/invitations/accept', {
        token,
        password: PASSWORD,
      });

      expect(response.status).toBe(204);
    });

    it('deve pedir a redefinição de senha sem sessão', async () => {
      // E-mail sem conta: a resposta é a mesma, e nenhum e-mail entra na fila dos outros testes.
      const response = await call(undefined, 'post', '/password-resets', {
        email: newEmail('sem-conta'),
      });

      expect(response.status).toBe(204);
    });

    it('deve chegar à redefinição de senha sem sessão', async () => {
      const response = await call(undefined, 'post', '/password-resets/confirm', {
        token: 'token-que-nao-existe',
        password: PASSWORD,
      });

      // 422 do token inválido, e não o 401 de uma rota protegida.
      expect(response.status).toBe(422);
    });

    it('deve chegar à confirmação do e-mail sem sessão', async () => {
      const response = await call(undefined, 'post', '/email-verifications/confirm', {
        token: 'token-que-nao-existe',
      });

      // 422 do token inválido, e não o 401 de uma rota protegida.
      expect(response.status).toBe(422);
    });

    it('deve manter o /api/health público', async () => {
      const response = await call(undefined, 'get', '/health');

      expect(response.status).toBe(200);
    });
  });

  describe('Sessão pendente: senha conferida, código da segunda etapa ainda não (RN25)', () => {
    it('deve renovar a sessão pendente, que continua pendente', async () => {
      const pending = await e2e.logInPending(actors.CLIENT);

      const response = await e2e.refresh(pending.refreshToken);

      expect(response.status).toBe(200);
      const me = await call(readTokens(response), 'get', '/users/me');
      expect(me.status).toBe(403);
    });

    it('deve sair com a sessão pendente', async () => {
      const response = await call(await e2e.logInPending(actors.CLIENT), 'post', '/auth/signout');

      expect(response.status).toBe(200);
    });

    it('deve responder 422 à sessão completa nas rotas da segunda etapa', async () => {
      const responses = await Promise.all([
        call(actors.CLIENT, 'post', '/mfa/verify', { code: '000000' }),
        call(actors.CLIENT, 'post', '/mfa/code'),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([422, 422]);
    });
  });

  describe.each(matrix)('$line', ({ routes }) => {
    describe.each(routes)('$route', ({ allowed, success, refused = {}, acceptsPending, send }) => {
      it('deve responder 401 sem sessão', async () => {
        const response = await send({ allowed: false });

        expect(response.status).toBe(401);
      });

      it.each(
        ROLES.map((role) => {
          const permitted = allowed.includes(role);

          return [role, permitted ? (refused[role] ?? success) : 403, permitted] as const;
        }),
      )('deve responder ao %s com %i', async (role, status, permitted) => {
        const response = await send({ actor: actors[role], allowed: permitted });

        expect(response.status).toBe(status);
      });

      if (!acceptsPending) {
        it('deve responder 403 à sessão pendente', async () => {
          const response = await send({ actor: pendingSession, allowed: false });

          expect(response.status).toBe(403);
          // O 403 do papel sem permissão tem outro corpo: este é o da segunda etapa.
          expect(response.body).toMatchObject({ message: 'invalid claim' });
        });
      }
    });
  });
});
