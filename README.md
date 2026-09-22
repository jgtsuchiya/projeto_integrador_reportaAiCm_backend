# projeto_integrador_reportaAiCm_backend

Backend do ReportaAi Cm em NestJS + TypeScript.

## Executando localmente

```bash
npm install
npm run start:dev   # http://localhost:3000/api/health
```

## Dependências

Todas as dependências usam **versão exata** (sem `^` ou `~`). O [.npmrc](.npmrc) já define `save-exact=true`, então `npm install <pacote>` grava a versão exata automaticamente. Atualizações de versão devem ser feitas de forma explícita, em um PR próprio.

## Arquitetura

Módulos por funcionalidade, com camadas `domain`, `application`, `infra` e `presentation`. Estrutura de pastas, regras de dependência, convenções de nomenclatura e aliases de importação estão documentados em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
