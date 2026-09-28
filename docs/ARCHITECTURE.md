# Arquitetura do projeto

Backend em **NestJS + TypeScript**, organizado em **módulos por funcionalidade** (feature modules). Dentro de cada módulo, o código é separado em **camadas** (domínio, aplicação, infraestrutura e apresentação), inspiradas em Clean Architecture.

O objetivo é que cada funcionalidade do ReportaAi Cm (ex.: `reports`, `users`, `auth`) seja autocontida e que as regras de negócio não dependam de framework, banco de dados ou HTTP.

## Estrutura de pastas

```
src/
├── main.ts                  # bootstrap da aplicação (prefixo global /api)
├── app.module.ts            # módulo raiz: só importa os módulos de feature/infra
├── config/                  # configuração e validação de variáveis de ambiente
├── shared/                  # código transversal, reutilizado por vários módulos
│   ├── domain/              # classes base de domínio, erros de domínio genéricos
│   ├── application/         # contratos genéricos (ex.: UseCase)
│   ├── infra/               # integrações compartilhadas (ex.: módulo de banco)
│   └── presentation/        # filters, interceptors, pipes, guards, decorators
└── modules/
    └── <feature>/
        ├── <feature>.module.ts
        ├── domain/
        │   ├── entities/        # entidades e regras de negócio puras
        │   ├── value-objects/   # valores validados e imutáveis (ex.: Email, Cpf)
        │   ├── repositories/    # contratos (abstract classes) dos repositórios
        │   └── errors/          # erros de domínio da feature
        ├── application/
        │   ├── use-cases/       # um caso de uso por arquivo
        │   ├── ports/           # contratos de serviços externos (ex.: IdentityProvider)
        │   └── dtos/            # entrada/saída dos casos de uso
        ├── infra/
        │   ├── database/
        │   │   ├── entities/     # entidades de persistência (TypeORM)
        │   │   ├── repositories/ # implementações dos contratos do domínio
        │   │   └── mappers/      # conversão persistência <-> domínio
        │   └── <integração>/     # adapters das portas (ex.: identity/, com o SuperTokens)
        └── presentation/
            ├── controllers/     # rotas HTTP
            └── dtos/            # validação de request/response
```

As subpastas só devem ser criadas quando houver conteúdo. O módulo [`health`](../src/modules/health) é o exemplo mínimo de referência (controller → caso de uso).

## Regra de dependência

As dependências apontam **para dentro**:

```
presentation ──► application ──► domain ◄── infra
```

| Camada         | Pode importar                                 | Não pode importar                                                    |
| -------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `domain`       | apenas `shared/domain`                        | NestJS, TypeORM, SuperTokens, `application`, `infra`, `presentation` |
| `application`  | `domain`, `shared/application`                | TypeORM, SuperTokens, `infra`, `presentation`                        |
| `infra`        | `domain`, `application`, bibliotecas externas | `presentation`                                                       |
| `presentation` | `application` (casos de uso e DTOs)           | `infra` diretamente                                                  |

O decorator `@Injectable()` é permitido em casos de uso, porque é só metadado de DI e não acopla a lógica ao framework. No `domain`, nenhum import de `@nestjs/*` é permitido.

Essas regras são **verificadas pelo ESLint** (`no-restricted-imports` em [eslint.config.mjs](../eslint.config.mjs)). Um import que viole uma fronteira quebra o `npm run lint` e bloqueia o commit.

### Inversão de dependência com repositórios

O domínio define o contrato como uma **abstract class**, que também serve de token de injeção no NestJS:

```ts
// modules/reports/domain/repositories/report.repository.ts
export abstract class ReportRepository {
  abstract findById(id: string): Promise<Report | null>;
  abstract save(report: Report): Promise<void>;
}
```

A infraestrutura implementa o contrato, e o módulo faz a ligação entre os dois:

```ts
// modules/reports/reports.module.ts
providers: [
  CreateReportUseCase,
  { provide: ReportRepository, useClass: TypeOrmReportRepository },
],
```

Assim, o caso de uso depende apenas de `ReportRepository`. Os testes unitários conseguem trocar a implementação por um fake sem precisar de banco.

Os serviços externos seguem o mesmo padrão, com a porta em `application/ports/`. No módulo `users`, o [`IdentityProvider`](../src/modules/users/application/ports/identity-provider.ts) (criar credencial, conferir e trocar senha, remover o usuário, revogar sessões, criar e atribuir papéis) é implementado pelo [`SuperTokensIdentityProvider`](../src/modules/users/infra/identity/supertokens-identity-provider.ts). Só a infra importa o `supertokens-node`.

### Entidades e value objects

- **Entidades** estendem [`Entity`](../src/shared/domain/entity.ts) e protegem as próprias regras: os dados só mudam por métodos com nome de negócio (`user.deactivate()`, `user.delete()`), nunca por setters. Cada entidade tem uma fábrica para os dados novos (`User.createClient(...)`), que valida, e um `restore(...)` para os dados já persistidos, usado pelos mappers.
- **Value objects** estendem [`ValueObject`](../src/shared/domain/value-object.ts): são criados por `create(raw)`, que normaliza e valida a entrada (ex.: `Cpf.create('123.456.789-09').value === '12345678909'`) e lança um erro de domínio quando ela é inválida. Dois value objects com o mesmo valor são iguais. A exceção é o [`Password`](../src/modules/users/domain/value-objects/password.ts), que guarda a senha num campo privado para ela não aparecer em `JSON.stringify` nem em logs.
- A cobertura de testes de `modules/users/domain` tem mínimo de 90%, verificado pelo `npm run test:cov` (e no CI).

### Comunicação entre módulos

Um módulo só acessa outro pelo que este **exporta** no seu `@Module({ exports: [...] })`, em geral um caso de uso ou um serviço de fachada. Nunca importe arquivos internos (`domain/`, `infra/`) de outro módulo.

## Validação, erros e paginação

A base HTTP compartilhada fica em `shared/` e vale para todas as rotas. O pipe e o filtro são globais, registrados no `AppModule` (e não no `main.ts`), para valerem também nos testes e2e.

### Validação de request

O [`ZodValidationPipe`](../src/shared/presentation/pipes/zod-validation.pipe.ts) valida o parâmetro com o schema Zod passado no próprio decorator e entrega o valor já transformado (coerções, defaults, `trim`):

```ts
@Post()
create(@Body({ schema: createClientSchema }) body: CreateClientBody) {}

@Get(':id')
findOne(@Param('id', { schema: z.uuid() }) id: string) {}
```

Parâmetros sem schema passam sem validação. As mensagens padrão do Zod saem em português, e o schema pode definir mensagens próprias.

### Erros

O domínio lança erros de uma das categorias de [`shared/domain/errors`](../src/shared/domain/errors), e o [`GlobalExceptionFilter`](../src/shared/presentation/filters/global-exception.filter.ts) os converte em HTTP:

| Categoria           | Status | Exemplo                             |
| ------------------- | ------ | ----------------------------------- |
| `NotFoundError`     | 404    | Usuário não encontrado              |
| `ConflictError`     | 409    | E-mail ou CPF já cadastrado         |
| `BusinessRuleError` | 422    | Transição de status inválida        |
| `ForbiddenError`    | 403    | Operação não permitida para o papel |

Os erros de cada feature estendem uma categoria (ex.: `class EmailAlreadyInUseError extends ConflictError`). O segundo argumento do construtor vai para `details`.

Todas as respostas de erro seguem o mesmo corpo:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Dados inválidos.",
  "details": [{ "field": "email", "message": "Formato do endereço de e-mail inválido" }]
}
```

`details` só aparece quando existe. Qualquer erro não mapeado vira 500 com `"message": "Erro interno do servidor."`: a mensagem original e o stack vão só para o log.

O Nest consulta os filtros globais na ordem inversa de registro. Um filtro mais específico (como o dos erros do SuperTokens) precisa ser registrado depois do `GlobalExceptionFilter` para ter precedência.

### Paginação

As listagens recebem `?page=1&pageSize=20` (`pageSize` de 1 a 100) e respondem `{ items, page, pageSize, total }`. Os tipos `PageRequest` e `Page<T>` ficam em [`shared/domain/pagination.ts`](../src/shared/domain/pagination.ts), para que os contratos de repositório também os usem, e o schema da query em [`page-request.schema.ts`](../src/shared/presentation/pagination/page-request.schema.ts). Os filtros de cada listagem estendem esse schema:

```ts
const listClientsQuerySchema = pageRequestSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
```

## Convenções de nomenclatura

| Item                         | Padrão                                                                                                      | Exemplo                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Arquivos e pastas            | `kebab-case`                                                                                                | `create-report.use-case.ts`                                |
| Sufixo por tipo              | `.module`, `.controller`, `.use-case`, `.entity`, `.orm-entity`, `.repository`, `.mapper`, `.dto`, `.error` | `report.orm-entity.ts`                                     |
| Implementação de repositório | prefixo da tecnologia                                                                                       | `typeorm-report.repository.ts` → `TypeOrmReportRepository` |
| Classes                      | `PascalCase` + sufixo do tipo                                                                               | `CreateReportUseCase`, `ReportsController`                 |
| Interfaces e tipos           | `PascalCase`, sem prefixo `I`                                                                               | `UseCase`, `CheckHealthOutput`                             |
| Variáveis e funções          | `camelCase`                                                                                                 | `reportRepository`                                         |
| Constantes globais           | `UPPER_SNAKE_CASE`                                                                                          | `DEFAULT_PAGE_SIZE`                                        |
| Módulos de feature           | plural, em inglês                                                                                           | `reports`, `users`                                         |
| Rotas HTTP                   | plural, `kebab-case`, sob `/api`                                                                            | `GET /api/reports`                                         |
| Testes unitários             | ao lado do arquivo testado, `*.spec.ts`                                                                     | `create-report.use-case.spec.ts`                           |
| Testes de integração         | em `test/`, `*.integration-spec.ts`                                                                         | `test/database.integration-spec.ts`                        |
| Testes e2e                   | em `test/`, `*.e2e-spec.ts`                                                                                 | `test/reports.e2e-spec.ts`                                 |

O código fica em inglês. Documentação, mensagens de commit e textos voltados ao usuário ficam em português.

## Aliases de importação

Configurados em `tsconfig.json` (`paths`). O `nest build` reescreve os aliases para caminhos relativos no `dist/`.

| Alias        | Aponta para     |
| ------------ | --------------- |
| `@/*`        | `src/*`         |
| `@config/*`  | `src/config/*`  |
| `@shared/*`  | `src/shared/*`  |
| `@modules/*` | `src/modules/*` |

**Regra de uso:** dentro do mesmo módulo, use imports relativos (`../../application/...`). Entre módulos ou para `shared`/`config`, use o alias (`@shared/application/use-case.interface`).

> Os aliases também estão replicados no `moduleNameMapper` do Jest (`package.json`). Ao criar um alias novo, atualize os dois lugares.

## Adicionando uma nova feature

1. Crie `src/modules/<feature>/<feature>.module.ts`.
2. Modele entidades e contratos de repositório em `domain/`.
3. Escreva os casos de uso em `application/use-cases/`.
4. Crie a entidade ORM e o mapper em `infra/database/`, registre a entidade com `TypeOrmModule.forFeature([...])`, implemente o repositório e ligue-o no módulo com `{ provide, useClass }`. Gere a migration correspondente (ver [DATABASE.md](DATABASE.md)).
5. Exponha as rotas em `presentation/controllers/`, com DTOs de validação em `presentation/dtos/`.
6. Importe o módulo em `app.module.ts`.
