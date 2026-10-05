# Guia de contribuição

Este projeto segue o **Git Flow**, com commits no padrão **Conventional Commits**. As regras abaixo são verificadas automaticamente pelos hooks do Husky e pela proteção de branches no GitHub.

## Fluxo de branches

```
feature/12-...    ●──●
                 /    \  (squash)
develop   ──●───●──────●──────────────●────────────●──
                        \            ↑ back-merge  ↑ back-merge
release/0.1.0            ●──●        │             │
                             \       │             │
main      ──●─────────────────●──────┘──────●──────┘──
                           v0.1.0     \    / v0.1.1
hotfix/31-...                          ●──●
```

### Branches permanentes

| Branch    | Papel                                                                        | Recebe merge de                                                                                       |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `main`    | Código em produção. Cada merge gera uma tag de versão.                       | `release/*` e `hotfix/*`                                                                              |
| `develop` | Integração do que foi concluído na sprint. É a branch padrão do repositório. | `feature/*`, `fix/*` e as demais branches de trabalho, além do back-merge de `release/*` e `hotfix/*` |

Nenhuma das duas aceita push direto. Toda mudança entra por Pull Request.

### Branches de trabalho

Formato: **`<tipo>/<nº da issue>-<descricao-em-kebab-case>`**, em letras minúsculas e sem acentos.

| Tipo        | Uso                                      | Sai de    | Volta para                          |
| ----------- | ---------------------------------------- | --------- | ----------------------------------- |
| `feature/`  | Nova funcionalidade                      | `develop` | `develop`                           |
| `fix/`      | Correção de bug ainda não lançado        | `develop` | `develop`                           |
| `refactor/` | Refatoração sem mudança de comportamento | `develop` | `develop`                           |
| `test/`     | Criação ou ajuste de testes              | `develop` | `develop`                           |
| `docs/`     | Documentação                             | `develop` | `develop`                           |
| `chore/`    | Configuração, dependências e build       | `develop` | `develop`                           |
| `release/`  | Preparação de versão: `release/<x.y.z>`  | `develop` | `main`, com back-merge em `develop` |
| `hotfix/`   | Correção urgente em produção             | `main`    | `main`, com back-merge em `develop` |

Exemplos: `feature/12-cadastro-de-denuncia`, `fix/15-corrige-paginacao`, `chore/2-git-flow`, `release/0.1.0`.

Toda branch de trabalho está ligada a uma issue. Se a issue não existir, crie-a antes.

## Dia a dia: desenvolvendo uma issue

```bash
git switch develop
git pull
git switch -c feature/12-cadastro-de-denuncia

# ... desenvolva, com commits pequenos no padrão abaixo ...

git push -u origin feature/12-cadastro-de-denuncia
# Abra o PR para a develop no GitHub
```

Se a `develop` avançar enquanto você trabalha, atualize a sua branch antes de pedir revisão:

```bash
git fetch origin
git rebase origin/develop           # ou: git merge origin/develop
git push --force-with-lease          # só depois de um rebase
```

## Releases e hotfixes

As versões seguem o **SemVer** (`MAJOR.MINOR.PATCH`). Enquanto o projeto estiver em `0.x`, cada sprint entregue incrementa o `MINOR`.

**Release, ao final da sprint:**

1. Crie `release/0.2.0` a partir da `develop`.
2. Na branch de release, faça apenas ajustes finais: versão no `package.json` e correções pequenas.
3. Abra um PR de `release/0.2.0` para a `main`. Depois do merge, crie a tag `v0.2.0` na `main`.
4. Abra um PR de `main` para `develop` (back-merge), para levar os ajustes da release de volta à `develop`.

**Hotfix:** siga o mesmo fluxo, partindo da `main` (`hotfix/31-corrige-login`) e incrementando o `PATCH` (`v0.2.1`).

## Commits

Padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), validado pelo **commitlint** no hook `commit-msg`:

```
<tipo>(<escopo opcional>): <descrição no imperativo, em minúsculas>

<corpo opcional: o que mudou e por quê>

<rodapé opcional: Closes #12, BREAKING CHANGE: ...>
```

| Tipo       | Quando usar                                   |
| ---------- | --------------------------------------------- |
| `feat`     | Nova funcionalidade                           |
| `fix`      | Correção de bug                               |
| `refactor` | Mudança de código sem alterar comportamento   |
| `perf`     | Melhoria de performance                       |
| `test`     | Testes                                        |
| `docs`     | Documentação                                  |
| `style`    | Formatação, sem mudança de lógica             |
| `build`    | Build e dependências (`package.json`, Docker) |
| `ci`       | Pipeline de CI (`.github/workflows`)          |
| `chore`    | Outras tarefas de manutenção e configuração   |
| `revert`   | Reversão de um commit anterior                |

Exemplos:

```
feat(reports): cria endpoint de cadastro de denúncia
fix(database): corrige timezone das datas salvas
chore(deps): atualiza typeorm para 1.1.2
docs: documenta fluxo de migrations
```

Regras:

- A descrição começa com **letra minúscula**, fica no **imperativo** ("cria", "corrige", não "criado" ou "corrigindo") e não termina com ponto.
- O cabeçalho tem no máximo **100 caracteres**.
- O escopo, quando usado, é o módulo afetado: `reports`, `users`, `database`, `config`...
- Mudança incompatível: use `!` depois do tipo (`feat(api)!: ...`) e explique no rodapé, em `BREAKING CHANGE:`.
- O antigo prefixo `config:` não é mais aceito. Use `chore:` ou `build:`.

## Pull Requests

- **Destino:** `develop` para qualquer branch de trabalho. A `main` recebe apenas `release/*`, `hotfix/*` e nada mais.
- **Título:** no mesmo padrão dos commits, por exemplo `feat(reports): cria endpoint de denúncia`. No squash merge, o título do PR vira o commit na `develop`.
- **Descrição:** preencha o template e vincule a issue com `Closes #12`, que fecha a issue automaticamente no merge.
- **Para o merge, são obrigatórios:**
  - **1 aprovação** de outra pessoa da equipe;
  - todas as conversas do review resolvidas;
  - os checks de CI (**Qualidade e testes unitários** e **Testes de integração**) passando;
  - a branch atualizada em relação ao destino.

### Método de merge

| Origem → destino                   | Método                    | Motivo                                                       |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------ |
| Branch de trabalho → `develop`     | **Squash and merge**      | Um commit por issue, e o histórico da `develop` fica legível |
| `release/*` ou `hotfix/*` → `main` | **Create a merge commit** | Preserva o histórico da versão                               |
| `main` → `develop` (back-merge)    | **Create a merge commit** | Evita conflitos em releases futuras                          |

## Verificações automáticas

| Quando                        | O que roda                                                                                  | Onde                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| `git commit`                  | ESLint, Prettier e testes relacionados aos arquivos staged                                  | `.husky/pre-commit`        |
| `git commit`                  | Validação da mensagem (commitlint)                                                          | `.husky/commit-msg`        |
| `git push`                    | Validação do nome da branch e bloqueio de push direto em `main` e `develop`                 | `.husky/pre-push`          |
| PR e push em `develop`/`main` | Lint, formatação, typecheck, testes unitários, build e testes de integração e e2e com MySQL | `.github/workflows/ci.yml` |

Numa emergência real, os hooks locais podem ser ignorados com `--no-verify`. A proteção do GitHub continua valendo.

## Configuração do repositório no GitHub

Precisa ser feita **uma única vez**, por alguém com permissão de administrador:

1. **Criar a `develop`** a partir da `main` atual:
   ```bash
   git switch main && git pull
   git switch -c develop
   git push -u origin develop
   ```
2. **Branch padrão:** em _Settings → General → Default branch_, troque para `develop`.
3. **Pull Requests:** em _Settings → General → Pull Requests_:
   - deixe marcados **Allow merge commits** e **Allow squash merging**, e desmarque **Allow rebase merging**;
   - em squash, escolha **Default to pull request title**;
   - marque **Automatically delete head branches**.
4. **Proteção de branches:** em _Settings → Rules → Rulesets → New ruleset → Import a ruleset_, importe os dois arquivos:
   - [.github/rulesets/main.json](.github/rulesets/main.json)
   - [.github/rulesets/develop.json](.github/rulesets/develop.json)

   Eles bloqueiam push direto, force-push e exclusão da branch, e exigem PR com 1 aprovação, conversas resolvidas e os checks de CI passando.

Os checks de CI só aparecem para seleção depois que o workflow rodar pela primeira vez. Se a importação reclamar deles, importe o ruleset, abra um PR qualquer para disparar o CI e depois confirme os checks em _Require status checks to pass_.
