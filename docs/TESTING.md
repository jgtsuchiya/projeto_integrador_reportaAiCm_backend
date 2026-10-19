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

Os fakes de um único módulo ficam em `src/modules/<feature>/testing`, também fora do build. No módulo `users`, o [`in-memory-users.ts`](../src/modules/users/testing/in-memory-users.ts) traz os repositórios em memória (que compartilham um `InMemoryUsersDatabase`, como as tabelas do MySQL) e o `FakeIdentityProvider`, no lugar do SuperTokens.

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

O `test/password-reset.integration-spec.ts` segue esse padrão. Para simular a passagem do intervalo de 1 minuto entre dois e-mails, ele recua o `created_at` do token. O `E2eApp` espera as tarefas no `close()`, antes de apagar os dados.

## Testes de rotas que enviam link por e-mail

O token de um link só existe no e-mail: o banco guarda o hash. O teste lê o token da mensagem que o `FakeMailSender` guardou, pelo caminho da página (`/verificar-email?token=...`), e segue o fluxo com ele.

A mesma conta recebe no máximo um e-mail do mesmo tipo por minuto, e o cadastro do Client já envia o link de verificação. Por isso, o reenvio logo depois do cadastro responde 422. Para simular a passagem do intervalo, o teste recua o `created_at` do token:

- nos testes de integração, direto no banco, como o `passResendInterval` do `test/email-verification.integration-spec.ts`;
- nos e2e, com o `e2e.passResendInterval(userId)` do `E2eApp`.

O teste que cadastra um Client pela API sobe a aplicação com o `FakeMailSender`, mesmo sem conferir o e-mail: sem ele, cada cadastro enviaria uma mensagem de verdade ao SMTP.

Para conferir que um segredo (a senha ou o token de um link) não vai para o log, suba a aplicação com o [`MemoryLogger`](../test/support/memory-logger.ts), que guarda as linhas em memória: `createNestApplication({ logger })`.

## Testes e2e

Os e2e sobem a API inteira e a chamam por HTTP com o **supertest**, contra o MySQL de teste e o SuperTokens Core. O único fake é o `FakeMailSender`, no lugar do SMTP. Eles cobrem os fluxos de ponta a ponta e as permissões. Os detalhes de cada rota (validação, erros e casos de borda) ficam nos testes de integração.

| Arquivo                         | O que cobre                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `test/client-flow.e2e-spec.ts`  | Fluxo do Client: cadastro → login → `/users/me` → refresh → signout                          |
| `test/admin-flow.e2e-spec.ts`   | Fluxo do ADM: seed do SuperAdm → convite → aceite → login                                    |
| `test/inactivation.e2e-spec.ts` | O usuário inativado perde o acesso na requisição seguinte                                    |
| `test/permissions.e2e-spec.ts`  | Matriz de permissões: cada rota protegida sem sessão (401) e com cada papel (sucesso ou 403) |

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

- **Banco de teste:** o script carrega o `.env.test` e usa a mesma proteção dos testes de integração (aborta se o banco não terminar em `_test`). Cada arquivo começa e termina **apagando todos os usuários** do banco de teste, as credenciais deles no SuperTokens e as tentativas de login.
- **Contas:** são criadas pelos mesmos caminhos da aplicação: `seedSuperAdmin()` (o caso de uso do `npm run seed`), `createAdmin()` (convite e aceite) e `registerClient()` (autocadastro). É o seed que cria os papéis no SuperTokens, então ele vem antes de qualquer cadastro, como em produção.
- **Login:** no modo header (`st-auth-mode: header`), como o app mobile. O access token vai no `Authorization: Bearer`.
- **Rota nova:** toda rota protegida entra na matriz do `permissions.e2e-spec.ts`, com os papéis permitidos e o status de sucesso. Quando um papel permitido para numa regra da própria rota, o status dela vai em `refused`: é o caso do reenvio da verificação de e-mail, que responde 422 ao ADM e ao SuperAdm, já verificados.

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
