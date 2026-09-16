# Agent operating contract

Instructions for AI coding agents working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md). Agents
must follow that file as well as this one; when process, style, tests, docs, commits or PRs conflict, CONTRIBUTING.md
wins and this file adds agent-specific constraints on top.

## What this is

`@cookiemonsterdev/casl-typeorm` integrates [CASL](https://casl.js.org) with TypeORM. Rule conditions are TypeORM
`FindOptionsWhere` objects. The package compiles an ability's rules into `FindOptionsWhere[]` for `find()`, into a
`SelectQueryBuilder` WHERE clause with `EXISTS` subqueries for relations, and into a MongoDB filter for TypeORM's mongodb
driver; it also provides the runtime conditions matcher behind `ability.can()` and a repository extension. Single
package, published as ESM only.

## Change checklist

After every completed change (or batch), walk this list. Mark each item **done** or **N/A** with a one-line reason.

1. **Scope** — One concern. No drive-by refactors, unrelated files or hand-formatting.
2. **CONTRIBUTING.md** — Branch naming, commits, tests and docs match that file.
3. **Tests**
   - Compiler or matcher change: unit tests beside the source (`src/**/*.test.ts`).
   - Behaviour that depends on the database: a scenario in `test/suites/sql/accessible-by.test.ts` (it cross-checks
     `applyTo()`, `find()` and `ability.can()`) or a Mongo scenario in `test/suites/mongo/`. Gate driver-specific tests
     with `testIfDb('postgres')`, `describeIfDb('postgres')`, `describeIfSql`, `describeIfMongo`; never read `DB` in a
     test file.
   - Unit tests never start Docker. Integration tests run in-process on sqlite by default and need Docker for the other
     databases unless `DB_EXTERNAL=1`.
4. **Docs** — Public API, semantics or operator support: update `README.md` (API table, operator table, caveats).
   Workflow or tooling: `CONTRIBUTING.md` and `test/assets/README.md`.
5. **Exports** — New public surface is re-exported from `src/index.ts` only. Types come from `tsc --emitDeclarationOnly`.
6. **Verification** — `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then
   `pnpm test:integration` (sqlite) and `DB=<db> pnpm test:integration` for every database the change can affect.
7. **Hygiene** — Filenames are kebab-case. Nothing generated (`dist/`, `coverage/`) is staged.
8. **Commit** — Suggest a Conventional Commit message. Do not commit or push unless asked.

## Commands

```sh
nvm use && corepack enable && pnpm install

pnpm lint && pnpm format:check && pnpm typecheck
pnpm test                               # unit only, never starts Docker
pnpm build

pnpm test:integration                   # sqlite, in-process
DB=postgres pnpm test:integration       # also mysql, mssql, mongodb; DB_VERSION picks a compose file
DB=postgres pnpm test:db:up             # start a database and keep it: then DB_EXTERNAL=1 pnpm test:integration
DB=postgres pnpm test:db:down
```

## Architecture

Everything public is re-exported from `src/index.ts`.

- `condition-tree.ts` — turns `ability.rulesFor()` output into an `and`/`or`/`not`/`where`/`always` tree via CASL's
  `rulesToCondition`. Every backend consumes this tree; do not re-implement rule priority anywhere else.
- `find-options.ts` — tree → `FindOptionsWhere[]`. Applies De Morgan to negated fragments, merges same-field
  constraints with `And()`, and throws `UnsupportedConditionError` for negated relation conditions.
- `query-builder.ts` — tree → `Brackets`/`NotBrackets` on a `SelectQueryBuilder`. Relation conditions become
  correlated `EXISTS` subqueries built from `RelationMetadata` join columns (`databaseName`, escaped with
  `qb.escape()`); columns, embeddeds and relation ids are delegated to TypeORM's object-literal `where`. Parameters flow
  to the root builder through TypeORM's `parentQueryBuilder` chain.
- `mongo-query.ts` — tree → MongoDB filter (dotted paths, `$nor` for negation, `_id` renaming).
- `typeorm-query-matcher.ts` — runtime evaluation of the same conditions against entity instances; semantics must
  stay consistent with the SQL output (documented exceptions: SQL `NULL` under negation).
- `find-operator.ts` — shared helpers: `isFindOperator`, `isNestedConditions`, `isConditionsList`, `valuesEqual`,
  `sqlLikeToRegex`.
- `repository.ts` — `accessibleRecords` for `Repository.extend()`.

## Code conventions

TypeScript is strict with `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`) and
`erasableSyntaxOnly` in `src/` (no enums, no parameter properties). ESLint runs the type-checked rules on `src/` and
`test/`; tests additionally use `@vitest/eslint-plugin`. Avoid `any` by typing at the boundary (`ObjectLiteral`,
`Record<string, unknown>`) rather than casting inside loops. Depend on TypeORM's public API only (`Brackets`,
`InstanceChecker`, metadata getters); never reach into protected query-builder methods.

Test fixtures use decorators with explicit column types (`Boolean`, `Date`, `'varchar'`, …) because esbuild emits no
decorator metadata. Keep the SQL seed deterministic; scenarios assert titles, not ids.

## Commits and branches

Conventional Commits (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`, `ci`, `revert`),
subject ≤72 characters, imperative, lowercase, no trailing period; `!` plus a `BREAKING CHANGE:` footer for breaking
changes. Branch from `develop` as `<type>/<short-kebab-description>`. `master` is released by semantic-release; never
edit the version or `CHANGELOG.md` by hand.
