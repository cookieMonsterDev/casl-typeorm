# Contributing

Thanks for helping improve `@cookiemonsterdev/casl-typeorm`. Open an issue before a large change so the approach can be
agreed first; small fixes can go straight to a pull request.

## Prerequisites

- Node 24 (`.nvmrc`) and pnpm 10 (`packageManager` in `package.json`; `corepack enable` installs it).
- Docker with Compose v2 for the database integration tests. SQLite runs in-process and needs no Docker.

```sh
nvm use && corepack enable && pnpm install
```

## Local development

| Command                        | Description                                                               |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm build`                   | Vite library build to `dist/` plus `tsc --emitDeclarationOnly` for types  |
| `pnpm dev`                     | Rebuild on change                                                         |
| `pnpm typecheck`               | `tsc --noEmit` for `src/` and for `test/`                                 |
| `pnpm lint` / `lint:fix`       | ESLint (type-checked rules)                                               |
| `pnpm format` / `format:check` | Prettier                                                                  |
| `pnpm test`                    | Unit tests (`src/**/*.test.ts`); never starts Docker                      |
| `pnpm test:integration`        | Integration suites against the database selected by `DB` (default sqlite) |
| `pnpm coverage`                | Unit tests with V8 coverage                                               |

## Project structure

```
src/
  accessible-by.ts          accessibleBy(): ofType(), applyTo(), toMongoQuery(), subject type inference
  condition-tree.ts         CASL rules → and/or/not tree of FindOptionsWhere fragments
  find-options.ts           tree → FindOptionsWhere[] (De Morgan, And() merging)
  query-builder.ts          tree → SelectQueryBuilder WHERE with EXISTS subqueries for relations
  mongo-query.ts            tree → MongoDB filter
  typeorm-query-matcher.ts  runtime matcher behind ability.can()
  repository.ts             accessibleRecords repository extension
  create-typeorm-ability.ts createTypeOrmAbility() factory and types
  find-operator.ts          shared FindOperator/value helpers
  errors.ts                 CaslTypeOrmError, UnsupportedConditionError
  index.ts                  public API; everything public is re-exported here
test/
  fixtures/                 decorator-based entities and deterministic seeds (SQL and Mongo)
  helpers/                  DB selection, DataSource factories, describeIfSql/describeIfMongo/testIfDb
  suites/                   integration tests, grouped by sql/ and mongo/
  assets/                   docker-compose.<db>-<version>.yml and the matrix README
scripts/                    compose-*.sh helpers and the release OIDC exchange
```

## Branch names

Branch from `develop`: `<type>/<short-kebab-description>`, e.g. `feat/exists-subqueries`, `fix/null-relation-match`.
`master` is the release branch; `develop` is merged into it with a merge commit (semantic-release reads every
Conventional Commit since the last tag, so never squash).

## Commits

Conventional Commits, enforced by commitlint on `commit-msg` and in CI:

```
<type>(<optional scope>): <imperative summary, ≤72 chars, lowercase, no period>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`, `ci`, `revert`. A breaking change
uses `!` after the type and a `BREAKING CHANGE:` footer. Scopes are optional (`matcher`, `query-builder`, `mongo`,
`ci`, …). One logical change per commit.

### Git hooks

| Hook         | Runs                                               |
| ------------ | -------------------------------------------------- |
| `pre-commit` | `lint-staged` (ESLint + Prettier) then `pnpm test` |
| `commit-msg` | `commitlint`                                       |

Integration tests are not in the hooks; they need Docker and run in CI.

## Tests

Unit tests live beside the source as `src/**/*.test.ts` and must not touch a database. Integration tests live in
`test/suites/**` and run against a real database:

```sh
pnpm test:integration                # sqlite, in-process
DB=postgres pnpm test:integration    # PostgreSQL 17 in Docker (DB_VERSION=15 for 15)
DB=mysql pnpm test:integration       # MySQL 9 (DB_VERSION=8 for 8)
DB=mssql pnpm test:integration       # SQL Server 2022 (amd64 image, emulated on Apple Silicon)
DB=mongodb pnpm test:integration     # MongoDB 8.2
```

Vitest's global setup runs `docker compose up --wait` and `down` around the run. `DB_EXTERNAL=1` skips both (start the
database yourself with `pnpm test:db:up`), `DO_NOT_STOP=1` leaves it running, `COMPOSE_FILE` points at a custom stack.
The version matrix and every environment variable are documented in [test/assets/README.md](test/assets/README.md).

Guidelines:

- Behaviour that differs by backend gets a scenario in the table-driven suite (`test/suites/sql/accessible-by.test.ts`),
  which cross-checks `applyTo()`, `find()` and `ability.can()` against each other.
- Gate driver-specific tests with `testIfDb('postgres')`, `describeIfSql`, `describeIfMongo` from `test/helpers`
  instead of reading `DB` in the test file.
- Fixture columns declare a portable `type` (`Boolean`, `Date`, `'varchar'`, `'int'`); esbuild emits no decorator
  metadata, so TypeORM cannot infer types.

## Pull requests

- One concern per PR; no unrelated refactors or formatting-only noise (Prettier and ESLint run on commit and in CI).
- Public API changes need unit tests, an integration scenario where behaviour depends on the database, and a README
  update.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build` must pass; CI additionally runs the
  integration matrix.
- Fill in `.github/pull_request_template.md`.

## Releasing

Merging `develop` into `master` triggers `.github/workflows/release.yml`: semantic-release computes the version from the
commits, updates `CHANGELOG.md` and `package.json`, tags, publishes to npm through trusted publishing (OIDC) and creates
the GitHub release. Never edit the version by hand.

## Configuration notes

- `package.json` `pnpm.onlyBuiltDependencies` allows `better-sqlite3`'s native build; pnpm 10 blocks other lifecycle
  scripts.
- `tsconfig.json` compiles `src/` with `erasableSyntaxOnly`; `test/tsconfig.json` relaxes it and enables
  `experimentalDecorators` for TypeORM entity fixtures.
- ESLint's type-checked rules use both tsconfig projects, so test files are linted with type information too.

## License

MIT. By contributing you agree that your contributions are licensed under the MIT license.
