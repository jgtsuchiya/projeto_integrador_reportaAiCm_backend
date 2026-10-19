import type request from 'supertest';

import { Role, ROLES } from '@modules/users/domain/value-objects/role';

import {
  Actor,
  buildClientPayload,
  E2eApp,
  InvitedAdmin,
  newEmail,
  PASSWORD,
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
  send: (call: Call) => PromiseLike<request.Response>;
}

/**
 * Matriz de permissões (docs/sprints/sprint-2-usuarios.md, seção 4): cada rota protegida é
 * chamada sem sessão (401) e com cada papel (o status de sucesso ou 403).
 */
describe('Matriz de permissões (e2e)', () => {
  let e2e: E2eApp;
  let actors: Record<Role, Actor>;
  /** Alvos das chamadas barradas e das permitidas que não os alteram. */
  let targets: { admin: Actor; pendingAdmin: InvitedAdmin; client: Actor };

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

  describe('Autocadastro de Client, login, refresh, aceite de convite e redefinição de senha (público)', () => {
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

    it('deve manter o /api/health público', async () => {
      const response = await call(undefined, 'get', '/health');

      expect(response.status).toBe(200);
    });
  });

  describe.each(matrix)('$line', ({ routes }) => {
    describe.each(routes)('$route', ({ allowed, success, send }) => {
      it('deve responder 401 sem sessão', async () => {
        const response = await send({ allowed: false });

        expect(response.status).toBe(401);
      });

      it.each(ROLES.map((role) => [role, allowed.includes(role) ? success : 403] as const))(
        'deve responder ao %s com %i',
        async (role, status) => {
          const response = await send({ actor: actors[role], allowed: status !== 403 });

          expect(response.status).toBe(status);
        },
      );
    });
  });
});
