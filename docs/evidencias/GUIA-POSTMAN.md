# Guia 2: evidências das issues no Postman

A coleção [reportaai-cm-sprint-2.postman_collection.json](reportaai-cm-sprint-2.postman_collection.json) tem as **51 requisições** que evidenciam as issues da Sprint 2, em 9 pastas na ordem de um fluxo completo. Cada requisição traz no nome as issues que ela comprova e tem testes automáticos que conferem o status e o corpo da resposta.

A coleção foi rodada contra a branch `develop`: 51 requisições, 104 testes, nenhuma falha.

## 1. Antes de começar

- O ambiente do [Guia 1 (Docker)](GUIA-DOCKER.md) no ar: http://localhost:3000/api/health responde `{"status":"ok"}`.
- O **Postman Desktop**. O Postman no navegador só acessa o `localhost` com o Postman Agent instalado.

## 2. Importar a coleção

1. No Postman, clique em **Import** (ou `Ctrl+O`).
2. Selecione o arquivo `docs/evidencias/reportaai-cm-sprint-2.postman_collection.json`, que está na pasta do projeto (`~/projeto_integrador_reportaAiCm_backend`).
3. A coleção aparece na barra lateral como **ReportaAi Cm - Sprint 2 (evidências)**.
4. Clique na coleção e abra a aba **Variables**. Confira `baseUrl` (`http://localhost:3000/api`) e `mailpitUrl` (`http://localhost:8025`).

Não é preciso criar um Environment: tudo fica nas variáveis da coleção.

## 3. Como a coleção funciona

- **Ordem:** as pastas vão de 0 a 8, e cada requisição tem um número (`2.8` = pasta 2, passo 8). Uma requisição usa o que as anteriores criaram, então siga a ordem.
- **Login no modo header**, como o app mobile faz: o login manda o header `st-auth-mode: header`, e os tokens da sessão voltam nos headers `st-access-token` e `st-refresh-token` da resposta. A aba **Scripts › Post-response** de cada login salva o token numa variável (`superAdminToken`, `adminToken` ou `clientToken`), e as rotas protegidas o enviam em `Authorization: Bearer {{...}}`.
- **Nada para copiar e colar:** os ids (`adminId`, `clientId`) e o token do convite também são salvos sozinhos. As requisições 2.3 e 2.6 leem o último e-mail do Mailpit pela API dele e tiram o token do link do convite.
- **Testes:** depois de cada envio, a aba **Test Results** da resposta mostra cada verificação em verde (PASS) ou vermelho (FAIL).
- **Pode rodar de novo:** no fim, a coleção exclui o Client (5.8) e o ADM (6.8), e o e-mail e o CPF ficam livres.
- **O access token dura 15 minutos.** Se você demorar entre um passo e outro e uma rota responder 401 sem motivo, envie de novo o último login daquele usuário (1.1, 2.10 ou 5.6).

## 4. Passo a passo

Clique em cada requisição, na ordem, e em **Send**. Para a evidência, tire um print com a URL, o corpo enviado, o status e a resposta e a aba **Test Results** toda verde.

### Pasta 0: Infraestrutura

| Passo | Rota                        | Resultado esperado                                 |
| ----- | --------------------------- | -------------------------------------------------- |
| 0.1   | `GET /health`               | 200, `{"status":"ok"}`                             |
| 0.2   | `POST /clients` (inválido)  | 400, com a lista dos campos inválidos em `details` |
| 0.3   | `GET /users/me` (sem token) | 401                                                |

### Pasta 1: Login do SuperAdm

| Passo | Rota                | Resultado esperado                                                                               |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------ |
| 1.1   | `POST /auth/signin` | 200, `{"status":"OK"}`. **No print, abra a aba Headers da resposta** para mostrar os dois tokens |
| 1.2   | `GET /users/me`     | 200, `"role": "SUPER_ADMIN"` e `"status": "ACTIVE"`                                              |

### Pasta 2: Convite de ADM

| Passo | Rota                                     | Resultado esperado                                                           |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| 2.1   | `POST /admins`                           | 201, `"status": "PENDING"` e `"invitation": {"sent": true}`                  |
| 2.2   | `POST /admins` (mesmo e-mail)            | 409                                                                          |
| 2.3   | Mailpit: último e-mail                   | 200, e-mail para `ana.souza@reportaai.local` com o link `/convite?token=...` |
| 2.4   | `POST /auth/signin` (ADM pendente)       | 200, mas com `"status": "WRONG_CREDENTIALS_ERROR"`: o ADM pendente não entra |
| 2.5   | `POST /admins/{{adminId}}/invitation`    | 200, `"sent": true`                                                          |
| 2.6   | Mailpit: último e-mail                   | 200, com um link novo                                                        |
| 2.7   | `POST /invitations/accept` (link antigo) | 422: o reenvio invalidou o primeiro link                                     |
| 2.8   | `POST /invitations/accept`               | 204: senha definida e ADM ativo                                              |
| 2.9   | `POST /invitations/accept` (de novo)     | 422: o link é de uso único                                                   |
| 2.10  | `POST /auth/signin` (ADM)                | 200, `{"status":"OK"}`                                                       |
| 2.11  | `POST /admins` (com o token do ADM)      | 403: só o SuperAdm gerencia ADMs                                             |

Depois do 2.6, abra http://localhost:8025 no navegador e **tire um print dos e-mails de convite** na caixa de entrada do Mailpit (evidência da #22).

### Pasta 3: Autocadastro do Client

| Passo | Rota                                 | Resultado esperado                                                              |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------- |
| 3.1   | `POST /clients`                      | 201, `"role": "CLIENT"`, CPF salvo só com dígitos (`52998224725`) e sem a senha |
| 3.2   | `POST /clients` (mesmo e-mail e CPF) | 409                                                                             |
| 3.3   | `POST /auth/signin` (Client)         | 200, `{"status":"OK"}`                                                          |

### Pasta 4: Gestão de Clients (painel)

| Passo | Rota                                   | Resultado esperado                                                         |
| ----- | -------------------------------------- | -------------------------------------------------------------------------- |
| 4.1   | `GET /clients?page=1&pageSize=20&...`  | 200, `{ items, page, pageSize, total }` e CPF mascarado (`***.982.247-**`) |
| 4.2   | `GET /clients/{{clientId}}`            | 200, CPF mascarado                                                         |
| 4.3   | `GET /clients` (com o token do Client) | 403                                                                        |
| 4.4   | `PATCH /clients/{{clientId}}/status`   | 200, `"status": "INACTIVE"`                                                |
| 4.5   | `GET /users/me` (Client inativo)       | 401: perdeu o acesso na hora, mesmo com o token ainda válido               |
| 4.6   | `POST /auth/signin` (Client inativo)   | 200, com `"status": "WRONG_CREDENTIALS_ERROR"`                             |
| 4.7   | `PATCH /clients/{{clientId}}/status`   | 200, `"status": "ACTIVE"`                                                  |
| 4.8   | `POST /auth/signin` (Client)           | 200, `{"status":"OK"}`                                                     |

### Pasta 5: Perfil do usuário (`/users/me`)

| Passo | Rota                                      | Resultado esperado                             |
| ----- | ----------------------------------------- | ---------------------------------------------- |
| 5.1   | `GET /users/me` (Client)                  | 200, `"role": "CLIENT"` e o CPF completo       |
| 5.2   | `PATCH /users/me`                         | 200, nome, telefone e nascimento atualizados   |
| 5.3   | `PATCH /users/me/password` (senha errada) | 401                                            |
| 5.4   | `PATCH /users/me/password`                | 204                                            |
| 5.5   | `POST /auth/signin` (senha antiga)        | 200, com `"status": "WRONG_CREDENTIALS_ERROR"` |
| 5.6   | `POST /auth/signin` (senha nova)          | 200, `{"status":"OK"}`                         |
| 5.7   | `DELETE /users/me` (com o token do ADM)   | 403: só o Client exclui a própria conta        |
| 5.8   | `DELETE /users/me` (Client)               | 204: dados anonimizados                        |
| 5.9   | `GET /users/me` (conta excluída)          | 401                                            |

### Pasta 6: Gestão de ADMs (SuperAdm)

| Passo | Rota                                 | Resultado esperado            |
| ----- | ------------------------------------ | ----------------------------- |
| 6.1   | `GET /admins?page=1&pageSize=20&...` | 200, lista paginada com o ADM |
| 6.2   | `GET /admins/{{adminId}}`            | 200, `"status": "ACTIVE"`     |
| 6.3   | `GET /admins/{{superAdminId}}`       | 404: a rota só enxerga ADMs   |
| 6.4   | `PATCH /admins/{{adminId}}`          | 200, nome atualizado          |
| 6.5   | `PATCH /admins/{{adminId}}/status`   | 200, `"status": "INACTIVE"`   |
| 6.6   | `GET /users/me` (ADM inativo)        | 401: perdeu o acesso na hora  |
| 6.7   | `PATCH /admins/{{adminId}}/status`   | 200, `"status": "ACTIVE"`     |
| 6.8   | `DELETE /admins/{{adminId}}`         | 204                           |
| 6.9   | `GET /admins/{{adminId}}`            | 404                           |

### Pasta 7: Sessão (renovar e encerrar)

| Passo | Rota                                   | Resultado esperado                      |
| ----- | -------------------------------------- | --------------------------------------- |
| 7.1   | `POST /auth/session/refresh`           | 200, novo par de tokens nos headers     |
| 7.2   | `POST /auth/signout`                   | 200, `{"status":"OK"}`                  |
| 7.3   | `POST /auth/session/refresh` (de novo) | 401: a sessão encerrada não renova mais |

### Pasta 8: Rotas nativas desativadas

| Passo | Rota                                   | Resultado esperado |
| ----- | -------------------------------------- | ------------------ |
| 8.1   | `POST /auth/signup`                    | 404                |
| 8.2   | `GET /auth/emailpassword/email/exists` | 404                |
| 8.3   | `POST /auth/user/password/reset/token` | 404                |

## 5. Rodar a coleção inteira de uma vez

Depois dos prints individuais, rode tudo para ter o print do resumo:

1. Clique com o botão direito na coleção e escolha **Run collection**.
2. Deixe as 51 requisições marcadas, na ordem padrão, com **1 iteração**, e clique em **Run**.
3. O resultado esperado é **51 requisições e 104 testes passando, nenhum falhando**. Tire o print do resumo.

Pelo terminal, o mesmo resultado sai com o Newman (o executor de coleções do Postman), na pasta do projeto:

```bash
cd ~/projeto_integrador_reportaAiCm_backend
npx newman run docs/evidencias/reportaai-cm-sprint-2.postman_collection.json
```

## 6. Mapa: issue → evidência

| Issue                                 | No Postman                                                                          | No terminal ([Guia 1](GUIA-DOCKER.md), seção 7) |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| #16 Infraestrutura HTTP               | 0.2 (400), 2.2 e 3.2 (409), 2.7 (422), 2.11 (403), 6.3 (404), 4.1 e 6.1 (paginação) | -                                               |
| #17 Modelagem e migrations            | -                                                                                   | `npm run migration:show`                        |
| #18 SuperTokens Core                  | 1.1 e 7.1                                                                           | `curl http://localhost:3567/hello`              |
| #19 Domínio de usuários               | 0.2 (CPF, e-mail e senha inválidos) e 4.4 a 4.7 (transições de status)              | `npm run test:cov`                              |
| #20 Seed do SuperAdm                  | 1.1 e 1.2                                                                           | `npm run seed` duas vezes                       |
| #21 Autenticação e controle de acesso | 0.3, 2.4, 4.5, 4.6, 6.6, 7.2, 7.3 e 8.1 a 8.3                                       | -                                               |
| #22 Serviço de e-mail                 | 2.3 e 2.6, e o print do Mailpit                                                     | -                                               |
| #23 Autocadastro do Client            | 3.1 a 3.3                                                                           | -                                               |
| #24 Convite de ADM                    | 2.1 a 2.11                                                                          | -                                               |
| #25 Gestão de ADMs                    | 2.11 e 6.1 a 6.9                                                                    | -                                               |
| #26 Gestão de Clients                 | 4.1 a 4.8                                                                           | -                                               |
| #27 Perfil do usuário                 | 1.2 e 5.1 a 5.9                                                                     | -                                               |
| #28 Testes e2e e matriz de permissões | O resumo do Runner (seção 5)                                                        | `npm run test:e2e`                              |
| #29 Documentação                      | -                                                                                   | `README.md` e `docs/`                           |
| Sprint 1 (#2 a #7)                    | 0.1 (a API no ar, conectada ao MySQL)                                               | Lint, testes, migrations e README               |

Sugestão de nome para os prints: `<passo>-issue-<número>.png`, por exemplo `2.8-issue-24.png`.

## 7. Problemas comuns

| Sintoma                                                  | Causa provável                                                       | Solução                                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Could not send request` ou `ECONNREFUSED` na porta 3000 | A API não está rodando                                               | `npm run start:dev` (Guia 1, seção 6)                                                                                                                                |
| 2.3 ou 2.6 falham com `ECONNREFUSED` na porta 8025       | O Mailpit não está no ar                                             | `npm run db:up`                                                                                                                                                      |
| 1.1 responde `WRONG_CREDENTIALS_ERROR`                   | O seed não rodou, ou rodou com outra senha                           | Guia 1, seção 5 e tabela de problemas                                                                                                                                |
| Uma rota protegida responde 401 com `try refresh token`  | O access token expirou (15 minutos)                                  | Envie de novo o login daquele usuário (1.1, 2.10 ou 5.6)                                                                                                             |
| 2.1 ou 3.1 respondem 409                                 | Uma rodada anterior parou no meio e o ADM ou o Client ficou no banco | Na aba Variables, troque `adminEmail`, `clientEmail` e `clientCpf` (CPFs válidos: `390.533.447-05`, `168.995.350-09`, `714.602.380-01`), ou zere o ambiente (Guia 1) |
| 2.7 responde 204 em vez de 422                           | O reenvio (2.5 e 2.6) foi pulado                                     | Rode a pasta 2 inteira, na ordem                                                                                                                                     |
