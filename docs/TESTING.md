# Testes

Testes unitários com **Jest** + **ts-jest**, usando **`@nestjs/testing`** quando for preciso montar o container de injeção de dependência do Nest.

## Estrutura

| Tipo       | Onde fica                             | Padrão de nome          |
| ---------- | ------------------------------------- | ----------------------- |
| Unitário   | ao lado do arquivo testado, em `src/` | `*.spec.ts`             |
| Integração | em `test/`                            | `*.integration-spec.ts` |
| e2e (HTTP) | em `test/`                            | `*.e2e-spec.ts`         |

```
src/modules/health/
├── application/use-cases/
│   ├── check-health.use-case.ts
│   └── check-health.use-case.spec.ts
└── presentation/controllers/
    ├── health.controller.ts
    └── health.controller.spec.ts
```

Deixar o teste ao lado do código deixa claro o que ainda não tem teste e evita imports longos. Os arquivos `*.spec.ts` ficam de fora do build (`tsconfig.build.json`).

## O que testar em cada camada

| Camada         | Como testar                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `domain`       | Instanciar diretamente (`new`), sem Nest e sem mocks. São as regras de negócio puras e devem ter a maior cobertura.         |
| `application`  | Instanciar o caso de uso com `new`, passando **fakes** dos repositórios (implementações em memória do contrato do domínio). |
| `presentation` | `Test.createTestingModule` com o caso de uso mockado (`useValue`). Verifica só a delegação e o mapeamento de entrada/saída. |
| `infra`        | Testes de integração com banco real (`test/*.integration-spec.ts`). Não mocke o TypeORM em teste unitário.                  |

## Convenções

- A instância testada se chama **`sut`** (_system under test_).
- Siga o formato **Arrange / Act / Assert**, separando as três etapas com linhas em branco.
- Use `describe` com o nome da classe e `it` com a frase do comportamento em português, começando por "deve".
- Use `it`, não `test`. O ESLint verifica isso.
- `it.only`, `describe.only`, `xit` e `it.skip` são bloqueados pelo ESLint, para que um teste focado ou desativado nunca chegue ao repositório.
- Os mocks são limpos e restaurados automaticamente entre os testes (`clearMocks` e `restoreMocks`).

Exemplo de caso de uso com repositório fake:

```ts
class InMemoryReportRepository extends ReportRepository {
  readonly items: Report[] = [];

  async save(report: Report): Promise<void> {
    this.items.push(report);
  }
}

describe('CreateReportUseCase', () => {
  it('deve persistir o reporte criado', async () => {
    const repository = new InMemoryReportRepository();
    const sut = new CreateReportUseCase(repository);

    await sut.execute({ title: 'Buraco na rua' });

    expect(repository.items).toHaveLength(1);
  });
});
```

## Fakes compartilhados

Um fake usado por um único teste fica no próprio arquivo de teste, como o repositório em memória acima. Os que servem a vários testes ficam em [`src/shared/testing`](../src/shared/testing), fora do build de produção, e são importados pelo alias (`@shared/testing/...`).

O [`FakeMailSender`](../src/shared/testing/fake-mail-sender.ts) guarda em `messages` os e-mails que seriam enviados. Ele entra pelo construtor nos testes de caso de uso e pelo `overrideProvider` nos testes que sobem a aplicação:

```ts
const mailSender = new FakeMailSender();

const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(MailSender)
  .useValue(mailSender)
  .compile();

// ...
expect(mailSender.messages).toHaveLength(1);
```

Os fakes de um único módulo ficam em `src/modules/<feature>/testing`, também fora do build. No módulo `users`, o [`in-memory-users.ts`](../src/modules/users/testing/in-memory-users.ts) traz os repositórios em memória (que compartilham um `InMemoryUsersDatabase`, como as tabelas do MySQL) e o `FakeIdentityProvider`, no lugar do SuperTokens. As sessões do fake são os handles de cada usuário, que o teste cria direto em `sessions`. O teste que confere os dados de uma sessão (datas, IP e user agent) a abre com o `openSession`.

No módulo `reports`, o [`in-memory-reports.ts`](../src/modules/reports/testing/in-memory-reports.ts) traz o `InMemoryReportRepository` e o `InMemoryReportPhotoRepository`, que compartilham um `InMemoryReportsDatabase` (com os reportes, as fotos e os votos). A busca por proximidade mede a distância por haversine, na esfera: o MySQL mede no elipsoide, e os dois diferem em menos de 0,5% (400 m no elipsoide dão 402 m no fake). O `vote` do fake roda a regra numa cópia do reporte e troca o guardado por ela, como a transação: quem leu o reporte antes fica com a versão anterior. É assim que os testes da edição e da exclusão simulam um voto chegando entre a leitura e a gravação (com o `findById` devolvendo a versão anterior). O [`report-fixtures.ts`](../src/modules/reports/testing/report-fixtures.ts) lê as [imagens das fixtures](#fixtures-de-imagem) e monta os dados de teste: a configuração padrão (`TEST_REPORTS_CONFIG`), um reporte aberto em Campo Mourão (`openTestReport`), o mesmo reporte com o status e as contagens que só a validação muda (`withReportChanges`) e um ponto a tantos metros ao norte de outro, no elipsoide (`pointNorthOf`).

Os repositórios em memória guardam as entidades por referência, então não reproduzem duas requisições lendo o mesmo dado ao mesmo tempo. O que depende disso, como o limite de erros do código da segunda etapa (`saveFailedAttempt` e `consume`), é testado contra o MySQL, no `test/users-repositories.integration-spec.ts` e no `test/mfa.integration-spec.ts`.

## Testes que fazem login

Todo login pela API grava uma linha em `login_attempts`, e 5 falhas seguidas para o mesmo e-mail o bloqueiam por 15 minutos ([AUTH.md](AUTH.md#bloqueio-do-login-por-tentativas)). Como o banco de teste é o mesmo entre uma execução e outra, o teste de integração que faz login:

- usa um **e-mail novo a cada execução** (`randomUUID()`), inclusive para o login que deve falhar. Com um e-mail fixo, as falhas de execuções seguidas se somariam até o bloqueio;
- **apaga as tentativas** dos e-mails que usou, no `afterAll`, com o [`deleteLoginAttempts`](../test/support/login-attempts.ts).

O bloqueio em si é testado no `test/login-lock.integration-spec.ts`. Para simular a passagem do tempo, ele recua o `created_at` da falha mais antiga.

## Testes de rotas que respondem antes de terminar

O `POST /api/password-resets` responde 204 antes de buscar a conta e de enviar o e-mail: o trabalho segue em segundo plano ([ARCHITECTURE.md](ARCHITECTURE.md#tarefas-em-segundo-plano)). Logo depois da resposta, o e-mail pode ainda não ter saído. O teste que sobe a aplicação espera as tarefas terminarem antes de conferir o resultado, inclusive quando o esperado é nenhum e-mail:

```ts
const response = await post('/password-resets', { email });
await app.get(BackgroundTasks).drain();

expect(response.status).toBe(204);
expect(mailSender.messages).toHaveLength(1);
```

O `test/password-reset.integration-spec.ts` segue esse padrão. Para simular a passagem do intervalo de 1 minuto entre dois e-mails, ele recua o `created_at` do token. Nos e2e, o teste espera com o `e2e.waitForBackgroundTasks()`, e o `E2eApp` também espera as tarefas no `close()`, antes de apagar os dados.

## Testes de rotas que enviam link por e-mail

O token de um link só existe no e-mail: o banco guarda o hash. O teste lê o token da mensagem que o `FakeMailSender` guardou, pelo caminho da página (`/verificar-email?token=...`), e segue o fluxo com ele. Nos e2e, o `e2e.lastLinkToken(email, page)` lê o token do último link para a página (`/convite`, `/redefinir-senha` ou `/verificar-email`) enviado ao endereço.

A mesma conta recebe no máximo um e-mail do mesmo tipo por minuto, e o cadastro do Client já envia o link de verificação. Por isso, o reenvio logo depois do cadastro responde 422. Para simular a passagem do intervalo, o teste recua o `created_at` do token:

- nos testes de integração, direto no banco, como o `passResendInterval` do `test/email-verification.integration-spec.ts`;
- nos e2e, com o `e2e.passResendInterval(userId)` do `E2eApp`.

O teste que cadastra um Client pela API sobe a aplicação com o `FakeMailSender`, mesmo sem conferir o e-mail: sem ele, cada cadastro enviaria uma mensagem de verdade ao SMTP.

Para conferir que um segredo (a senha, o token de um link ou o código da segunda etapa) não vai para o log, suba a aplicação com o [`MemoryLogger`](../test/support/memory-logger.ts), que guarda as linhas em memória: `createNestApplication({ logger })`.

## Testes da segunda etapa do login

O código da segunda etapa também só existe no e-mail. No texto da mensagem, ele fica sozinho numa linha, e o teste o lê com `/^\d{6}$/m` ([AUTH.md](AUTH.md#verificação-em-duas-etapas)).

- **Ligar a verificação em duas etapas.** A rota de ativação (`PATCH /api/users/me/mfa`) tem os próprios testes, no `test/profile.integration-spec.ts`. Os testes da segunda etapa ligam o `users.mfa_enabled` direto no banco, porque a rota exige o e-mail verificado e revoga as outras sessões da conta. O `test/mfa.integration-spec.ts` cria o usuário já com ele ligado. Nos e2e, o `e2e.logInPending(account)` o liga só durante o login e devolve os tokens da sessão pendente: os outros logins da conta continuam completos. O fluxo que precisa da conta com a verificação ativa de verdade usa o `e2e.registerClientWithMfa()`, que passa pela rota.
- **Ler o código.** Nos e2e, com o `e2e.lastLoginCode(email)`. Um login feito menos de 1 minuto depois de outro não envia um código novo, e o helper devolve o do e-mail anterior, que continua valendo.
- **Código sorteado.** O teste que precisa de um código conhecido (ex.: o código de outra conta, que tem de ser diferente) troca o `token_hash` no banco, como o `setCode` do `test/mfa.integration-spec.ts`. Comparar dois códigos sorteados falharia uma vez em um milhão.
- **Intervalo de 1 minuto.** Vale o mesmo recuo do `created_at` dos links: o login já envia um código, então o reenvio logo em seguida responde 422.
- **Estado da sessão.** A claim `mfa-verified` vai no payload do access token, que é um JWT: o teste de integração a lê decodificando o token, sem chamar a API.

## Fixtures de imagem

As imagens dos testes de reportes ficam em [`test/fixtures`](../test/fixtures). Foram geradas com o Pillow (Python), pequenas, para os testes não pesarem:

| Arquivo                        | Conteúdo                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `report-photo.jpg`             | Foto JPEG baseline de 160 × 120, só com o JFIF                                                            |
| `report-thumbnail.jpg`         | Miniatura JPEG baseline de 48 × 36                                                                        |
| `report-photo-progressive.jpg` | JPEG progressivo de 200 × 150                                                                             |
| `report-photo-metadata.jpg`    | JPEG de 160 × 120 com EXIF com GPS e XMP (APP1), perfil de cor (APP2) e IPTC com um nome de autor (APP13) |
| `photo.png` e `photo.webp`     | Imagens em outros formatos, que a API recusa                                                              |
| `photo.heic`                   | Só o cabeçalho de um HEIC (a caixa `ftyp` com a marca `heic`), que é o que identifica o formato           |

- O JPEG cortado e o arquivo qualquer são montados no próprio teste (um pedaço da foto e um texto).
- Para testar as dimensões máximas sem gerar outra imagem, o teste do `ReportImage` troca a largura e a altura no marcador SOF de uma cópia da fixture (`withDimensions`). O tamanho máximo é testado com um limite menor que a fixture.
- Nos testes unitários, as fixtures são lidas pelo `readFixture` do `report-fixtures.ts`, e nos e2e, pelo `fixtureBase64` do `E2eApp`, já em base64.

## Testes de integração dos reportes

- **Repositórios** (`test/reports-repositories.integration-spec.ts`). Cada teste roda numa transação desfeita no final, como os de usuários. O `DataSource` do teste guarda as queries num logger próprio (`QueryRecorder`), para conferir que as listagens não leem as colunas das imagens e para rodar o `EXPLAIN` da busca por proximidade com os mesmos parâmetros.
- **Índice espacial.** Com poucas linhas, o otimizador prefere ler a tabela inteira, que é mais barato. O teste do plano grava uma grade de 5 mil reportes, roda o `ANALYZE TABLE` e confere o `EXPLAIN FORMAT=TRADITIONAL` (`type: range`, `key: sidx_reports_location`). O `ANALYZE TABLE` confirma a transação aberta, então esse teste roda fora dela e apaga os dados no final.
- **Pedidos simultâneos.** O teste da mesma `Idempotency-Key` em pedidos simultâneos roda fora da transação, porque cada pedido precisa da própria conexão, como na API.
- **Votos.** O `vote` do repositório é conferido dentro da transação do teste (o `manager.transaction` vira um savepoint): o voto e as contagens gravados, o `FOR UPDATE` na query, o voto repetido (`DuplicateVoteError`, sem mudar as contagens), a regra que desfaz tudo e o reporte excluído. A edição e a exclusão de um reporte lido antes de um voto são recusadas. Os **12 votos simultâneos** com o limite em 10 rodam fora da transação, cada um com a própria conexão, pelo `VoteOnReportUseCase` com a configuração padrão: terminam com 10 confirmações, o status CONFIRMED, uma única mudança de status e 2 recusas.
- **Migration dos votos** (`test/database.integration-spec.ts`). Reverte e aplica de novo com reportes e votos gravados, e confere o UNIQUE do voto repetido, a FK do usuário e a cascata com o reporte.
- **Rotas** (`test/reports.integration-spec.ts`). Sobe a aplicação pelo `E2eApp`, com o `MemoryLogger`, e confere a validação da foto campo a campo, o 413, os metadados da foto gravada, os pedidos simultâneos pela API, o corpo do voto e, por último, que nada da foto ou das coordenadas (do reporte e de quem vota) foi para o log.

## Testes e2e

Os e2e sobem a API inteira e a chamam por HTTP com o **supertest**, contra o MySQL de teste e o SuperTokens Core. O único fake é o `FakeMailSender`, no lugar do SMTP. Eles cobrem os fluxos de ponta a ponta e as permissões. Os detalhes de cada rota (validação, erros e casos de borda) ficam nos testes de integração.

| Arquivo                               | O que cobre                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/client-flow.e2e-spec.ts`        | Fluxo do Client: cadastro → login → `/users/me` → refresh → signout                                                                                                                                      |
| `test/admin-flow.e2e-spec.ts`         | Fluxo do ADM: seed do SuperAdm → convite → aceite → login                                                                                                                                                |
| `test/inactivation.e2e-spec.ts`       | O usuário inativado perde o acesso na requisição seguinte                                                                                                                                                |
| `test/permissions.e2e-spec.ts`        | Matriz de permissões: cada rota protegida sem sessão (401), com cada papel (sucesso ou 403) e com uma sessão pendente (403 `invalid claim`)                                                              |
| `test/password-reset.e2e-spec.ts`     | Recuperação de senha: pedido → e-mail → redefinição → login com a senha nova, com as sessões antigas encerradas                                                                                          |
| `test/email-verification.e2e-spec.ts` | Verificação de e-mail: cadastro → e-mail → confirmação → `emailVerifiedAt` preenchido. O reenvio invalida o link anterior                                                                                |
| `test/login-lock.e2e-spec.ts`         | Bloqueio por tentativas: 5 falhas → bloqueio → liberação pela redefinição de senha                                                                                                                       |
| `test/sessions.e2e-spec.ts`           | Sessões: dois logins → listagem → encerrar a outra → ela não renova mais. Também o encerramento de todas as outras e a sessão de outro usuário (404)                                                     |
| `test/mfa.e2e-spec.ts`                | Verificação em duas etapas: ativação → login → 403 com a sessão pendente → código → acesso liberado. Também o reenvio do código e a desativação                                                          |
| `test/reports.e2e-spec.ts`            | Reportes: abrir → listar → detalhe → foto → editar → excluir. Também o e-mail não verificado, a área, a precisão, o limite por dia, a `Idempotency-Key`, a visibilidade entre dois Clients e o 413       |
| `test/report-votes.e2e-spec.ts`       | Validação comunitária: confirmar até CONFIRMED, negar até REJECTED, voto repetido (409), do autor, de longe, impreciso, com o e-mail não verificado e num reporte excluído, e votos simultâneos pela API |

```bash
npm run db:up
npm run test:e2e
```

O [`E2eApp`](../test/support/e2e-app.ts) sobe a aplicação e traz os helpers que preparam o cenário:

```ts
describe('Perfil (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await E2eApp.start();
    await e2e.seedSuperAdmin();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('deve retornar o perfil do Client', async () => {
    const client = await e2e.registerClient();

    const response = await e2e
      .api()
      .get('/api/users/me')
      .auth(client.accessToken, { type: 'bearer' });

    expect(response.status).toBe(200);
  });
});
```

- **Banco de teste:** o script carrega o `.env.test` e usa a mesma proteção dos testes de integração (aborta se o banco não terminar em `_test`). Cada arquivo começa e termina **apagando todos os usuários** do banco de teste, os reportes (com as fotos e os votos), as credenciais deles no SuperTokens e as tentativas de login.
- **Contas:** são criadas pelos mesmos caminhos da aplicação: `seedSuperAdmin()` (o caso de uso do `npm run seed`), `createAdmin()` (convite e aceite) e `registerClient()` (autocadastro). É o seed que cria os papéis no SuperTokens, então ele vem antes de qualquer cadastro, como em produção.
- **Login:** no modo header (`st-auth-mode: header`), como o app mobile. O access token vai no `Authorization: Bearer`.
- **Sessões:** o `currentSessionId(tokens)` devolve o id da sessão dos tokens, como o `GET /api/users/me/sessions` a identifica. O teste que encerra uma sessão abre uma só para isso, com o `logIn`: a sessão que os outros testes compartilham continua valendo.
- **Sessão pendente:** o `logInPending(account)` abre a sessão de quem já passou pela senha e ainda não conferiu o código da segunda etapa, e o `lastLoginCode(email)` lê o código do e-mail ([testes da segunda etapa](#testes-da-segunda-etapa-do-login)).
- **Conta com a verificação em duas etapas:** o `registerClientWithMfa()` cadastra um Client, confirma o e-mail pelo link e ativa a verificação pelo `PATCH /api/users/me/mfa`. Devolve a sessão que ativou, que continua completa. Os logins seguintes abrem sessões pendentes.
- **E-mails:** o `lastLinkToken(email, page)` lê o token do último link enviado ao endereço ([links por e-mail](#testes-de-rotas-que-enviam-link-por-e-mail)). O pedido de redefinição de senha envia o e-mail depois de responder, então o teste chama o `waitForBackgroundTasks()` antes de ler o link.
- **E-mail confirmado:** o `confirmEmail(account)` confirma o e-mail pelo link do cadastro, e o `registerVerifiedClient()` cadastra o Client já com o e-mail confirmado. Abrir reportes exige o e-mail confirmado (RN26), e a sessão do Client continua a mesma depois da confirmação.
- **Reportes:** o `buildReportPayload(overrides)` monta o corpo de um reporte válido em Campo Mourão, com a foto e a miniatura das [fixtures](#fixtures-de-imagem) em base64 (`fixtureBase64(nome)`), e o `openReport(client)` abre um pela rota. O `updateReportVoting(id, { status, confirmationsCount })` muda direto no banco o status e as contagens, sem os votos, para testar as regras que dependem deles sem criar uma conta por voto. O `storedReportPhoto(id)` lê a foto gravada, e o `countReports(authorId)` conta os reportes do Client, inclusive os excluídos. O mesmo Client abre no máximo 10 reportes por dia: o teste que abre muitos usa um Client só para ele.
- **Votos:** o `registerVerifiedClients(n)` cadastra N Clients com o e-mail confirmado (votar exige, RN37), um depois do outro. O `vote(voter, reportId, payload)` vota pela rota e devolve a resposta, para os testes das recusas, e o `voteWithEach(voters, reportId, payload)` vota com cada um, falhando se algum não responder 201, para levar o reporte a um ponto da validação. O `buildVotePayload(overrides)` monta o corpo, com a localização no ponto dos reportes de teste. O `.env.test` deixa as duas contagens da validação em 3 (`REPORT_CONFIRMATIONS_REQUIRED` e `REPORT_REJECTIONS_REQUIRED`), para os e2e criarem menos contas: a regra com 10 fica nos testes unitários, e o teste de integração dos votos simultâneos usa a configuração padrão (`TEST_REPORTS_CONFIG`).
- **Log:** o `E2eApp.start({ logger })` sobe a aplicação com o logger informado, como o `MemoryLogger`. Sem ele, o log fica desligado.
- **Corpo:** o `E2eApp` cria a aplicação com `bodyParser: false`, como o `main.ts`: os parsers do corpo, com o limite de cada rota, vêm do `configureApp`.
- **Rota nova:** toda rota protegida entra na matriz do `permissions.e2e-spec.ts`, com os papéis permitidos e o status de sucesso. Quando um papel permitido para numa regra da própria rota, o status dela vai em `refused`: é o caso do reenvio da verificação de e-mail, que responde 422 ao ADM e ao SuperAdm, já verificados. A matriz também chama cada rota com uma sessão pendente e espera o 403 `invalid claim`. Só as rotas marcadas com `acceptsPending` ficam de fora: o signout e as de `/api/mfa`.

## Comandos

| Comando                    | O que faz                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                 | Roda todos os testes                                                                                                           |
| `npm run test:watch`       | Roda em modo watch                                                                                                             |
| `npm run test:cov`         | Gera o relatório de cobertura em `coverage/`                                                                                   |
| `npm run test:debug`       | Roda com o inspector do Node (`--inspect-brk`)                                                                                 |
| `npm run test:integration` | Roda os testes de integração contra o MySQL de teste, o SuperTokens e o Mailpit ([detalhes](DATABASE.md#testes-de-integração)) |
| `npm run test:e2e`         | Roda os testes e2e contra o MySQL de teste e o SuperTokens ([detalhes](#testes-e2e))                                           |

No pre-commit, o `lint-staged` roda apenas os testes relacionados aos arquivos `.ts` alterados (`--findRelatedTests`). Se algum falhar, o commit é bloqueado.

## Detalhes da configuração

- **Configuração do Jest:** fica na chave `jest` do `package.json`. Os aliases (`@shared/*`, `@modules/*` etc.) são replicados em `moduleNameMapper`.
- **NestJS 12 é ESM-only.** O Jest carrega esses pacotes via `require(esm)`, que precisa de Node 24.9+ e da flag `--experimental-vm-modules`. Por isso, os scripts chamam o Jest pelo `node` com essa flag. **Rode os testes sempre pelos scripts do npm**, e não com `npx jest` direto.
- **`isolatedModules`:** o ts-jest só transpila, sem checar tipos, o que deixa os testes mais rápidos. Os erros de tipo nos testes são detectados por `npm run typecheck` e pelo ESLint.
