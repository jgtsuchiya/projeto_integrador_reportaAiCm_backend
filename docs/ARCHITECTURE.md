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
        │   ├── repositories/    # contratos (abstract classes) dos repositórios
        │   └── errors/          # erros de domínio da feature
        ├── application/
        │   ├── use-cases/       # um caso de uso por arquivo
        │   └── dtos/            # entrada/saída dos casos de uso
        ├── infra/
        │   └── database/
        │       ├── entities/     # entidades de persistência (TypeORM)
        │       ├── repositories/ # implementações dos contratos do domínio
        │       └── mappers/      # conversão persistência <-> domínio
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

| Camada         | Pode importar                                 | Não pode importar                                       |
| -------------- | --------------------------------------------- | ------------------------------------------------------- |
| `domain`       | apenas `shared/domain`                        | NestJS, TypeORM, `application`, `infra`, `presentation` |
| `application`  | `domain`, `shared/application`                | `infra`, `presentation`                                 |
| `infra`        | `domain`, `application`, bibliotecas externas | `presentation`                                          |
| `presentation` | `application` (casos de uso e DTOs)           | `infra` diretamente                                     |

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

### Comunicação entre módulos

Um módulo só acessa outro pelo que este **exporta** no seu `@Module({ exports: [...] })`, em geral um caso de uso ou um serviço de fachada. Nunca importe arquivos internos (`domain/`, `infra/`) de outro módulo.

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
