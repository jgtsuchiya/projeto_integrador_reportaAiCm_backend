# Banco de dados

**MySQL 9.7 (LTS)** com **TypeORM 1.x**, integrado ao Nest via `@nestjs/typeorm`. O schema muda **somente por migrations**. O `synchronize` fica sempre desligado.

## Ambiente local

O MySQL roda em Docker, pelo [docker-compose.yml](../docker-compose.yml):

```bash
cp .env.example .env   # ajuste se necessário
npm run db:up          # sobe o MySQL e aguarda ficar saudável
npm run migration:run  # aplica as migrations
npm run start:dev
```

- O container expõe a porta **3307**, para não conflitar com um MySQL instalado localmente na 3306. Para mudar, altere `DB_PORT` no `.env`.
- Na primeira inicialização, o script [docker/mysql/init](../docker/mysql/init/01-create-test-database.sh) cria também o banco de testes `<DB_DATABASE>_test`.
- Os dados ficam no volume `mysql-data`. Para zerar o banco, rode `docker compose down -v`. Isso **apaga todos os dados**, e os scripts de inicialização rodam de novo na próxima subida.

## Variáveis de ambiente

As variáveis são validadas na inicialização pelo schema Zod em [src/config/env.schema.ts](../src/config/env.schema.ts). Se alguma estiver inválida, a aplicação não sobe e mostra qual variável está errada.

| Variável           | Padrão                  | Descrição                                                    |
| ------------------ | ----------------------- | ------------------------------------------------------------ |
| `NODE_ENV`         | `development`           | `development`, `test` ou `production`                        |
| `PORT`             | `3000`                  | Porta HTTP da aplicação                                      |
| `DB_HOST`          | (obrigatória)           | Host do MySQL                                                |
| `DB_PORT`          | `3306`                  | Porta do MySQL (`3307` no `.env.example`, que é a do Docker) |
| `DB_USERNAME`      | (obrigatória)           | Usuário da aplicação                                         |
| `DB_PASSWORD`      | (obrigatória)           | Senha do usuário                                             |
| `DB_DATABASE`      | (obrigatória)           | Nome do banco                                                |
| `DB_LOGGING`       | `false`                 | Loga as queries SQL (`true`/`false`)                         |
| `DB_ROOT_PASSWORD` | (obrigatória no Docker) | Senha de root, usada apenas pelo docker-compose              |

Para adicionar uma variável, declare-a no `envSchema` e no `.env.example`. No código, leia os valores pelo `ConfigService<Env, true>` com `{ infer: true }`, para ter tipagem, e não pelo `process.env` direto.

## Entidades

O domínio e a persistência usam classes separadas (ver [ARCHITECTURE.md](ARCHITECTURE.md)):

| Classe              | Onde fica                                                   | Papel                                                                                                                                         |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Entidade de domínio | `modules/<feature>/domain/entities/*.entity.ts`             | Regras de negócio. Estende [`Entity`](../src/shared/domain/entity.ts), que gera o id (UUID) e compara identidade.                             |
| Entidade ORM        | `modules/<feature>/infra/database/entities/*.orm-entity.ts` | Mapeamento da tabela. Estende [`BaseOrmEntity`](../src/shared/infra/database/base.orm-entity.ts), que traz `id`, `created_at` e `updated_at`. |
| Mapper              | `modules/<feature>/infra/database/mappers/*.mapper.ts`      | Converte uma na outra (`toDomain` e `toPersistence`).                                                                                         |

Convenções de mapeamento:

- **Tabelas** no plural e em `snake_case`: `@Entity('reports')`.
- **Colunas** em `snake_case`, com nome explícito: `@Column({ name: 'full_name' })`.
- **Datas** em `datetime(3)` e em UTC. A conexão usa `timezone: 'Z'`.
- **Charset** `utf8mb4`, que aceita acentos e emojis.

As entidades ORM são registradas no módulo da própria feature com `TypeOrmModule.forFeature([ReportOrmEntity])`. O `autoLoadEntities` já as inclui na conexão, então não existe uma lista global de entidades para manter.

## Migrations

As migrations ficam em [src/shared/infra/database/migrations](../src/shared/infra/database/migrations), numa única linha do tempo para todo o projeto. A CLI do TypeORM roda sobre o código **compilado** (`dist/`), e por isso os scripts fazem o build antes de executar.

| Comando                                                                     | O que faz                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run migration:generate -- src/shared/infra/database/migrations/<Nome>` | Gera uma migration com a diferença entre as entidades e o banco |
| `npm run migration:run`                                                     | Aplica as migrations pendentes                                  |
| `npm run migration:revert`                                                  | Desfaz a última migration aplicada                              |
| `npm run migration:show`                                                    | Lista as migrations e mostra quais já foram aplicadas           |

Regras:

- **Nunca edite uma migration que já foi mergeada.** Para corrigir algo, crie uma nova.
- Revise o SQL gerado antes de commitar. O `migration:generate` pode propor um `DROP` inesperado.
- Implemente o `down` sempre que a reversão for possível.

## Testes de integração

Ficam em `test/`, com o padrão `*.integration-spec.ts`, e rodam contra um MySQL real:

```bash
npm run db:up
npm run test:integration
```

O script carrega o `.env` e, em seguida, o [.env.test](../.env.test), que troca o banco para `reportaai_cm_test`. Como proteção, o teste **aborta se o nome do banco não terminar em `_test`**, para nunca rodar migrations no banco de desenvolvimento.
