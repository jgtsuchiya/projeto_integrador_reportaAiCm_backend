# Guia 1: subir o ambiente da Sprint 2 com Docker

Este guia deixa a API da Sprint 2 rodando em `http://localhost:3000/api`, pronta para os testes do [Guia 2 (Postman)](GUIA-POSTMAN.md). No fim, há os comandos de terminal que servem de evidência para as issues que o Postman não cobre.

**Por que a branch `develop`:** o código das Sprints 1 e 2 (Epics #1 e #15) foi integrado na `develop` pelo PR #44. A `main` ainda está na Sprint 1, e as branches `feature/4x`/`feature/5x` já trazem a Sprint 3, que muda o login.

## 1. O que vai rodar

| Serviço                   | Container                     | Endereço                          | Para que serve                               |
| ------------------------- | ----------------------------- | --------------------------------- | -------------------------------------------- |
| MySQL 9.7                 | `reportaai-cm-mysql`          | `localhost:3307`                  | Dados da aplicação (`reportaai_cm`)          |
| SuperTokens Core 12.2     | `reportaai-cm-supertokens`    | http://localhost:3567             | Credenciais, sessões e papéis                |
| PostgreSQL do SuperTokens | `reportaai-cm-supertokens-db` | só na rede interna do Docker      | Banco exclusivo do Core                      |
| Mailpit                   | `reportaai-cm-mailpit`        | http://localhost:8025 (SMTP 1025) | Caixa de entrada dos e-mails enviados em dev |
| API NestJS                | (roda fora do Docker)         | http://localhost:3000/api         | A API, iniciada com `npm run start:dev`      |

## 2. Pré-requisitos

- **Docker** com o **Docker Compose** (`docker compose version` responde).
- **Node.js 24.11 ou mais novo** (`node -v`).
- As portas **3000, 3307, 3567, 1025 e 8025** livres.

## 3. Pegar o código da `develop` sem mexer no trabalho atual

A pasta atual do projeto está na branch `feature/59-verificacao-email-token`, com alterações não commitadas. Para não precisar de `stash` nem de troca de branch, crie uma segunda pasta só com a `develop` (um _worktree_ do Git):

```bash
cd ~/projeto_integrador_reportaAiCm_backend
git fetch origin
git worktree add ../reportaai-sprint2 develop

cd ../reportaai-sprint2
git pull                 # garante a develop igual à do GitHub
npm ci                   # instala as dependências exatas do package-lock
cp .env.example .env     # os valores do exemplo já funcionam em dev
```

> A partir daqui, **todos os comandos rodam dentro de `~/reportaai-sprint2`**.

## 4. Subir os containers

```bash
npm run db:up
```

O comando roda `docker compose up -d --wait`: ele só termina quando os quatro containers estão saudáveis. Para conferir:

```bash
docker compose ps                    # os quatro com STATUS "healthy"
curl http://localhost:3567/hello     # responde: Hello
```

E abra http://localhost:8025 no navegador: é a caixa de entrada do Mailpit.

> O docker-compose tem nome fixo (`reportaai-cm`), então as duas pastas do projeto usam **os mesmos containers e os mesmos dados**. Se eles já estavam no ar, o `db:up` só confirma que estão saudáveis.

## 5. Criar as tabelas e o SuperAdm

```bash
npm run migration:run    # aplica as migrations pendentes
npm run migration:show   # lista as migrations
npm run seed             # cria o SuperAdm e os papéis no SuperTokens
```

Saída esperada:

```text
# migration:show
[X] 1 InitialSetup1790122298215
[X] 2 CreateUsersTables1790554645270

# seed (primeira vez)
[Seed] SuperAdm criado (id ...).

# seed (se já existia)
[Seed] Já existe um SuperAdm cadastrado. Nada foi alterado.
```

O SuperAdm usa as variáveis `SUPER_ADMIN_*` do `.env`: **`superadmin@reportaai.local`** e a senha **`SuperAdmin123`**.

## 6. Iniciar a API

```bash
npm run start:dev
```

Deixe esse terminal aberto. Antes de `Nest application successfully started`, o log lista as 17 rotas da aplicação (`Mapped {/api/admins, POST} route` etc.): **tire um print**, ele mostra de uma vez todas as rotas da Sprint 2.

Depois, abra http://localhost:3000/api/health. A resposta esperada é:

```json
{ "status": "ok", "timestamp": "..." }
```

O ambiente está pronto. Siga para o [Guia 2 (Postman)](GUIA-POSTMAN.md).

## 7. Evidências pelo terminal

Algumas issues são de configuração, banco ou testes automatizados, e a evidência delas é a saída de um comando. Rode em **outro terminal**, dentro de `~/reportaai-sprint2`, com os containers no ar, e tire um print de cada saída.

| Issue                                     | Comando                                                                 | O que aparece                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| #3 Arquitetura de pastas                  | `ls src/modules/users/*` e o `docs/ARCHITECTURE.md`                     | As camadas `domain`, `application`, `infra` e `presentation`       |
| #4 ESLint e Prettier                      | `npm run lint` e `npm run format:check`                                 | Nenhum erro, e "All matched files use Prettier code style!"        |
| #5 Testes unitários                       | `npm test`                                                              | `Test Suites: 64 passed` e `Tests: 491 passed`                     |
| #6 MySQL com TypeORM e #17 Migrations     | `npm run migration:show`                                                | As duas migrations com `[X]`                                       |
| #18 SuperTokens Core                      | `curl http://localhost:3567/hello`                                      | `Hello`                                                            |
| #19 Domínio de usuários                   | `npm run test:cov`                                                      | `src/modules/users/domain/*` com 100% de cobertura                 |
| #20 Seed do SuperAdm                      | `npm run seed` duas vezes                                               | Na segunda: "Já existe um SuperAdm cadastrado. Nada foi alterado." |
| #22 Serviço de e-mail                     | http://localhost:8025, depois da pasta 2 do Postman                     | Os e-mails de convite na caixa de entrada                          |
| #28 Testes e2e e matriz de permissões     | `npm run test:e2e`                                                      | `Test Suites: 4 passed` e `Tests: 77 passed`                       |
| Testes de integração (#6, #17 a #27)      | `npm run test:integration`                                              | `Test Suites: 12 passed` e `Tests: 158 passed`                     |
| #2 Git Flow, #7 README e #29 Documentação | `CONTRIBUTING.md`, `README.md` e `docs/` no GitHub; a aba Pull requests | O fluxo de branches, o onboarding e a documentação da Sprint 2     |

Os testes de integração e e2e usam o banco `reportaai_cm_test`, separado do banco de dev: eles não apagam os dados que você criou pelo Postman.

## 8. Desligar e limpar

```bash
# Para a API: Ctrl+C no terminal do start:dev

npm run db:down          # para os containers e mantém os dados
```

Quando terminar as evidências, apague a pasta extra (o código da `develop` continua no Git):

```bash
cd ~/projeto_integrador_reportaAiCm_backend
git worktree remove ../reportaai-sprint2
```

### Zerar o ambiente (opcional)

Só se quiser começar do zero, ou se algum problema da tabela abaixo pedir. **Apaga todos os dados locais do MySQL e do SuperTokens**, inclusive os que a pasta da branch atual usa:

```bash
docker compose down -v
npm run db:up && npm run migration:run && npm run seed
```

## 9. Problemas comuns

| Sintoma                                                   | Causa provável                                                   | Solução                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run db:up` falha com "port is already allocated"     | Outro processo ou container usa a 3307, a 3567, a 1025 ou a 8025 | `docker ps` para achar o container e pará-lo                                       |
| A API não sobe e mostra "Variáveis de ambiente inválidas" | O `.env` não veio do `.env.example` da `develop`                 | Refaça o `cp .env.example .env` dentro de `~/reportaai-sprint2`                    |
| `git worktree add` responde "already exists"              | A pasta `../reportaai-sprint2` já existe                         | Use-a (`cd` e `git pull`) ou remova com `git worktree remove ../reportaai-sprint2` |
| O login do SuperAdm responde `WRONG_CREDENTIALS_ERROR`    | O seed não rodou, ou rodou com outra senha                       | Rode `npm run seed`. Se ele disser que o SuperAdm já existe, zere o ambiente       |
| O seed responde "E-mail já cadastrado"                    | O MySQL foi apagado sem o SuperTokens                            | Zere o ambiente: os dois bancos precisam andar juntos                              |
| `POST /api/clients` ou `POST /api/admins` responde 500    | Os papéis ainda não existem no SuperTokens                       | Rode `npm run seed`                                                                |
| `npm run migration:show` mostra uma terceira migration    | O banco foi usado pela branch da Sprint 3                        | Não atrapalha os testes da Sprint 2. Para um print limpo, zere o ambiente          |
