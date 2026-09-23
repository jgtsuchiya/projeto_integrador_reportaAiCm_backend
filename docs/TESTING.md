# Testes

Testes unitários com **Jest** + **ts-jest**, usando **`@nestjs/testing`** quando for preciso montar o container de injeção de dependência do Nest.

## Estrutura

| Tipo             | Onde fica                             | Padrão de nome  |
| ---------------- | ------------------------------------- | --------------- |
| Unitário         | ao lado do arquivo testado, em `src/` | `*.spec.ts`     |
| Integração / e2e | em `test/` (será criado na issue #6)  | `*.e2e-spec.ts` |

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
| `infra`        | Testes de integração com banco real, na issue #6. Não mocke o TypeORM em teste unitário.                                    |

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
  it('deve persistir o relato criado', async () => {
    const repository = new InMemoryReportRepository();
    const sut = new CreateReportUseCase(repository);

    await sut.execute({ title: 'Buraco na rua' });

    expect(repository.items).toHaveLength(1);
  });
});
```

## Comandos

| Comando              | O que faz                                      |
| -------------------- | ---------------------------------------------- |
| `npm test`           | Roda todos os testes                           |
| `npm run test:watch` | Roda em modo watch                             |
| `npm run test:cov`   | Gera o relatório de cobertura em `coverage/`   |
| `npm run test:debug` | Roda com o inspector do Node (`--inspect-brk`) |

No pre-commit, o `lint-staged` roda apenas os testes relacionados aos arquivos `.ts` alterados (`--findRelatedTests`). Se algum falhar, o commit é bloqueado.

## Detalhes da configuração

- **Configuração do Jest:** fica na chave `jest` do `package.json`. Os aliases (`@shared/*`, `@modules/*` etc.) são replicados em `moduleNameMapper`.
- **NestJS 12 é ESM-only.** O Jest carrega esses pacotes via `require(esm)`, que precisa de Node 24.9+ e da flag `--experimental-vm-modules`. Por isso, os scripts chamam o Jest pelo `node` com essa flag. **Rode os testes sempre pelos scripts do npm**, e não com `npx jest` direto.
- **`isolatedModules`:** o ts-jest só transpila, sem checar tipos, o que deixa os testes mais rápidos. Os erros de tipo nos testes são detectados por `npm run typecheck` e pelo ESLint.
