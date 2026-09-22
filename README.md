# projeto_integrador_reportaAiCm_backend

Backend do ReportaAi Cm em NestJS + TypeScript.

## Executando localmente

```bash
npm install         # também instala os hooks do Husky
npm run start:dev   # http://localhost:3000/api/health
```

## Dependências

Todas as dependências usam **versão exata** (sem `^` ou `~`). O [.npmrc](.npmrc) já define `save-exact=true`, então `npm install <pacote>` grava a versão exata automaticamente. Atualizações de versão devem ser feitas de forma explícita, em um PR próprio.

## Qualidade de código

ESLint (com regras de tipo do `typescript-eslint`) + Prettier. O Husky executa o `lint-staged` no pre-commit: os arquivos staged são corrigidos automaticamente, e o commit é bloqueado se restar algum erro.

| Comando                | O que faz                                                       |
| ---------------------- | --------------------------------------------------------------- |
| `npm run lint`         | Verifica o projeto inteiro (falha com qualquer erro ou warning) |
| `npm run lint:fix`     | Corrige o que for possível automaticamente                      |
| `npm run format`       | Formata todos os arquivos com Prettier                          |
| `npm run format:check` | Verifica a formatação sem alterar arquivos                      |
| `npm run typecheck`    | Checa os tipos sem gerar build                                  |

No VS Code, instale as extensões recomendadas (ESLint, Prettier e EditorConfig) para formatar e corrigir ao salvar.

## Arquitetura

Módulos por funcionalidade, com camadas `domain`, `application`, `infra` e `presentation`. Estrutura de pastas, regras de dependência, convenções de nomenclatura e aliases de importação estão documentados em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
