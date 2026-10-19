# Guia rápido para os times web e mobile

Como o painel web e o app fazem login e chamam a API do ReportaAi Cm. O funcionamento por dentro (sessão, guard e permissões) está no [AUTH.md](AUTH.md).

## O essencial

- A API fica sob `/api` (em dev, `http://localhost:3000/api`), e as rotas de login, sob `/api/auth`.
- O login é o mesmo para os três papéis: e-mail e senha no `POST /api/auth/signin`.
- **Use o SDK do SuperTokens.** Ele guarda os tokens, os envia nas requisições e renova a sessão sozinho quando o access token expira (a cada 15 minutos).
- Depois do login, chame o `GET /api/users/me` para saber **quem entrou e com qual papel**.

|                      | Painel web                                | App mobile                                  |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| SDK                  | `supertokens-web-js`                      | `supertokens-react-native`                  |
| Onde os tokens ficam | Cookies httpOnly, que o JavaScript não lê | Headers, guardados pelo SDK no AsyncStorage |
| Papéis               | `SUPER_ADMIN` e `ADMIN`                   | `CLIENT`                                    |
| Cadastro             | Convite por e-mail (ADM)                  | Autocadastro (`POST /api/clients`)          |

Os exemplos abaixo seguem a API pública do `supertokens-web-js` 0.16 e do `supertokens-react-native` 5.1, as versões atuais, compatíveis com o `supertokens-node` 24.0.3 do backend.

> A API não sabe de qual front veio o login: um Client consegue se autenticar pelo painel, e um ADM, pelo app. As rotas já barram o papel errado (403), mas cabe a cada front conferir o `role` do `/users/me` e recusar quem não é do seu público.

## Painel web

```bash
npm install supertokens-web-js
```

Inicialize o SDK uma vez, na entrada da aplicação, antes de qualquer requisição:

```ts
import SuperTokens from 'supertokens-web-js';
import EmailPassword from 'supertokens-web-js/recipe/emailpassword';
import Session from 'supertokens-web-js/recipe/session';

SuperTokens.init({
  appInfo: {
    appName: 'ReportaAi Cm',
    apiDomain: 'http://localhost:3000', // sem o /api
    apiBasePath: '/api/auth',
  },
  recipeList: [Session.init(), EmailPassword.init()],
});
```

**Login:**

```ts
import { signIn } from 'supertokens-web-js/recipe/emailpassword';

const response = await signIn({
  formFields: [
    { id: 'email', value: email },
    { id: 'password', value: password },
  ],
});

if (response.status === 'OK') {
  // Sessão criada: os cookies já estão no navegador.
} else if (response.status === 'FIELD_ERROR') {
  // E-mail fora do formato: response.formFields traz o erro de cada campo.
} else {
  // WRONG_CREDENTIALS_ERROR: mostre "E-mail ou senha incorretos".
}
```

O `WRONG_CREDENTIALS_ERROR` também é a resposta para um usuário inativado, excluído ou com o convite pendente. A API não diferencia os casos, para não revelar se o e-mail tem conta.

**Chamadas à API.** Depois do `init`, o SDK intercepta o `fetch` e o `XMLHttpRequest` (o axios funciona sem configuração extra). Nas requisições para o `apiDomain`, ele envia os cookies, renova a sessão quando recebe 401 e repete a chamada:

```ts
const response = await fetch('http://localhost:3000/api/users/me');
const me = await response.json(); // { id, role, name, email, status, ... }
```

**Sessão:**

```ts
import Session from 'supertokens-web-js/recipe/session';

await Session.doesSessionExist(); // true se há sessão (use para proteger as páginas)
await Session.signOut(); // encerra a sessão na API e limpa os cookies
```

**Em dev**, o painel precisa rodar na origem configurada no `WEB_APP_URL` da API (`http://localhost:5173` no `.env.example`): é a única que o CORS libera. Use `localhost` na API e no painel, sem misturar com `127.0.0.1`, senão o navegador não envia os cookies.

### Aceite do convite de ADM

O e-mail de convite leva o ADM para **`<WEB_APP_URL>/convite?token=<token>`**. Essa página fica no painel:

1. Leia o `token` da URL e mostre um formulário para o ADM escolher a senha.
2. Envie o `POST /api/invitations/accept` com `{ "token": "...", "password": "..." }`. A rota é pública.
3. Com o 204, leve o ADM para a tela de login.

| Resposta | Significado                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------- |
| 204      | Senha definida e acesso ativado                                                                         |
| 400      | Senha fora da regra (de 8 a 128 caracteres, com pelo menos uma letra e um número)                       |
| 422      | Link inválido, expirado (48 horas), já usado ou substituído por um reenvio. O SuperAdm precisa reenviar |

## App mobile

```bash
npm install supertokens-react-native @react-native-async-storage/async-storage
```

O SDK guarda os tokens no AsyncStorage (versões de 1.13 a 2.2). Inicialize-o uma vez, na entrada do app:

```ts
import SuperTokens from 'supertokens-react-native';

SuperTokens.init({
  apiDomain: API_URL, // ex.: http://10.0.2.2:3000 no emulador Android, sem o /api
  apiBasePath: '/api/auth',
});
```

**Cadastro.** O cidadão cria a conta pelo `POST /api/clients`, que é público, e o app faz o login em seguida:

```ts
const response = await fetch(`${API_URL}/api/clients`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Maria da Silva',
    email: 'maria.silva@exemplo.com',
    password: 'SenhaForte123',
    cpf: '529.982.247-25',
    phone: '(44) 99999-8888',
    birthDate: '1990-05-20',
  }),
});
// 201: conta criada. 400: campos inválidos. 409: e-mail ou CPF já cadastrado.
```

**Login.** O SDK de React Native cuida só da sessão, então o login é uma chamada direta à rota:

```ts
const response = await fetch(`${API_URL}/api/auth/signin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    formFields: [
      { id: 'email', value: email },
      { id: 'password', value: password },
    ],
  }),
});
const result = await response.json();

if (result.status === 'OK') {
  // Sessão criada: o SDK já guardou os tokens.
} else {
  // WRONG_CREDENTIALS_ERROR ou FIELD_ERROR (o status HTTP é 200 nos dois casos).
}
```

O SDK intercepta o `fetch` das requisições para o `apiDomain`: pede os tokens por header (`st-auth-mode: header`), guarda os que voltam na resposta, envia o access token no `Authorization` das chamadas seguintes e renova a sessão quando recebe 401. Com o axios, registre o interceptor uma vez: `SuperTokens.addAxiosInterceptors(axios)`.

**Sessão:**

```ts
await SuperTokens.doesSessionExist(); // true se há sessão guardada (decide a tela inicial)
await SuperTokens.signOut(); // encerra a sessão na API e apaga os tokens
```

**Em dev**, o `localhost` do aparelho não é o da sua máquina. Use `http://10.0.2.2:3000` no emulador Android, `http://localhost:3000` no simulador do iOS e o IP da máquina na rede num aparelho físico. O app não passa pelo CORS.

## Depois do login: perfil e papel

```http
GET /api/users/me
```

```json
{
  "id": "48550ab5-e0ae-44e9-a646-997c89a9fdb4",
  "role": "CLIENT",
  "name": "Maria da Silva",
  "email": "maria.silva@exemplo.com",
  "status": "ACTIVE",
  "emailVerifiedAt": null,
  "lastLoginAt": "2026-10-04T23:57:35.427Z",
  "createdAt": "2026-10-04T23:57:35.237Z",
  "updatedAt": "2026-10-04T23:57:35.237Z",
  "cpf": "52998224725",
  "phone": "44999998888",
  "birthDate": "1990-05-20"
}
```

- `role` é `SUPER_ADMIN`, `ADMIN` ou `CLIENT`, e não muda depois que a conta é criada.
- `cpf`, `phone` e `birthDate` só existem para o Client. CPF e telefone vêm só com dígitos: a máscara é por conta do front.
- No painel, o CPF dos Clients vem sempre mascarado (`***.982.247-**`) nas rotas de `/api/clients`.

## Quando a sessão acaba

A renovação do access token é automática e o usuário não percebe. A sessão termina de vez quando:

- o usuário sai (`signOut`);
- o refresh token expira, depois de 7 dias sem uso;
- o usuário é inativado ou excluído: o bloqueio vale na requisição seguinte;
- a senha é trocada em outro aparelho: as outras sessões caem na renovação seguinte, em até 15 minutos, e a de quem trocou continua.

Nesses casos, a API responde 401, o SDK apaga os tokens e avisa pelo `onHandleEvent`, com a ação `UNAUTHORISED`. Use o evento para levar o usuário à tela de login:

```ts
// Web: Session.init({ onHandleEvent }). App: SuperTokens.init({ ..., onHandleEvent }).
function onHandleEvent(event: { action: string }) {
  if (event.action === 'UNAUTHORISED' || event.action === 'SIGN_OUT') {
    // Ir para a tela de login.
  }
}
```

## Rotas de cada front

| Rota                                                                        | Painel web | App | Observação                                                  |
| --------------------------------------------------------------------------- | :--------: | :-: | ----------------------------------------------------------- |
| `POST /api/auth/signin`, `/session/refresh` e `/signout`                    |     ✔      |  ✔  | Pelo SDK                                                    |
| `GET` e `PATCH /api/users/me`                                               |     ✔      |  ✔  | O Client também edita `phone` e `birthDate`                 |
| `PATCH /api/users/me/password`                                              |     ✔      |  ✔  | `{ currentPassword, newPassword }`. Senha atual errada: 401 |
| `POST /api/clients`                                                         |            |  ✔  | Autocadastro, sem sessão                                    |
| `DELETE /api/users/me`                                                      |            |  ✔  | `{ password }`. Exclui e anonimiza a conta do Client        |
| `POST /api/invitations/accept`                                              |     ✔      |     | Página `/convite`, sem sessão                               |
| `GET /api/clients`, `GET /api/clients/:id`, `PATCH /api/clients/:id/status` |     ✔      |     | `ADMIN` e `SUPER_ADMIN`                                     |
| `/api/admins` (convite, listagem, edição, status, reenvio, exclusão)        |     ✔      |     | Só o `SUPER_ADMIN`                                          |

As listagens recebem `?page=1&pageSize=20` (até 100 por página) e respondem `{ items, page, pageSize, total }`. O corpo e a resposta de cada rota estão na coleção [api.http](api.http), e quem pode chamar cada uma, na [matriz de permissões](AUTH.md#matriz-de-permissões).

## Regras dos campos

A API valida tudo de novo, mas validar no front evita uma ida ao servidor:

| Campo       | Regra                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `name`      | De 1 a 120 caracteres                                                                                                       |
| `email`     | Único no sistema. É salvo em minúsculas e sem espaços nas pontas                                                            |
| `password`  | De 8 a 128 caracteres, com pelo menos uma letra e um número                                                                 |
| `cpf`       | Com ou sem máscara (`529.982.247-25` ou `52998224725`), com os dígitos verificadores válidos. Único e não pode ser alterado |
| `phone`     | DDD + número, com ou sem máscara. Celular com 9 dígitos, começando por 9, ou fixo com 8 dígitos                             |
| `birthDate` | `AAAA-MM-DD`, no passado                                                                                                    |

## Erros

As rotas da aplicação respondem os erros sempre no mesmo formato, com a `message` em português, pronta para ser exibida:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Dados inválidos.",
  "details": [
    { "field": "cpf", "message": "CPF inválido." },
    { "field": "password", "message": "A senha deve ter de 8 a 128 caracteres." }
  ]
}
```

| Status | Quando                                      | `details`                                                     |
| ------ | ------------------------------------------- | ------------------------------------------------------------- |
| 400    | Campo inválido ou ausente                   | Lista com `field` e `message` de cada campo                   |
| 401    | Senha de confirmação incorreta (ver abaixo) | `{ "field": "currentPassword" }` ou `{ "field": "password" }` |
| 403    | O papel não tem permissão                   | (ausente)                                                     |
| 404    | Recurso não encontrado                      | (ausente)                                                     |
| 409    | E-mail ou CPF já cadastrado                 | `{ "field": "email" }` ou `{ "field": "cpf" }`                |
| 422    | Regra de negócio (ex.: convite expirado)    | Depende da regra                                              |
| 429    | Muitas requisições do mesmo IP (ver abaixo) | (ausente)                                                     |

O 429 vem do limite por IP do login, do cadastro do Client e do aceite do convite: cada uma dessas rotas aceita 20 requisições por minuto por IP. A resposta traz o header `Retry-After`, com os segundos que faltam para a próxima tentativa.

As rotas de `/api/auth` seguem o formato do SuperTokens: o login responde 200 com o resultado em `status`, e a falta de sessão responde 401 com `{ "message": "unauthorised" }`. A exceção é o 429, que tem o formato acima também no login.

> **Atenção à senha de confirmação incorreta.** O `PATCH /api/users/me/password` e o `DELETE /api/users/me` respondem 401 quando a senha informada está errada. Os dois SDKs tratam qualquer 401 da API como sessão expirada: renovam a sessão e repetem a chamada, até 10 vezes (`maxRetryAttemptsForSessionRefresh`), e depois lançam um erro em vez de devolver a resposta. Nessas duas chamadas, capture o erro e trate-o como senha incorreta.

## Testando sem o front

- [api.http](api.http) tem todas as rotas prontas para executar no VS Code, na ordem de um fluxo completo.
- Em dev, os e-mails de convite não saem para a internet: eles aparecem no Mailpit, em http://localhost:8025.
- O SuperAdm de dev é criado pelo `npm run seed`, com o e-mail e a senha das variáveis `SUPER_ADMIN_*` do `.env` ([README](../README.md#primeiro-login)).
