# Contributing

Contributions are welcome. Please open an issue before submitting a pull request for significant changes.

## Setup

This package is part of a pnpm workspace. Clone the repo and install from the workspace root:

```sh
cd ..          # workspace root: the casl/ parent directory
pnpm install
```

## Development workflow

All commands below run from the `casl-typeorm/` directory.

| Command            | Description                   |
| ------------------ | ----------------------------- |
| `pnpm build`       | Compile TypeScript to `dist/` |
| `pnpm build:watch` | Compile in watch mode         |
| `pnpm test`        | Run tests with coverage       |
| `pnpm typecheck`   | Type-check without emitting   |

## Project structure

```
src/
  accessible-by.ts          # accessibleBy() — converts rules to FindOptionsWhere
  create-typeorm-ability.ts  # createTypeOrmAbility() factory
  typeorm-query-matcher.ts   # runtime conditions evaluator (ability.can() support)
  index.ts                   # public API re-exports
  __tests__/                 # Jest test suites
dist/                        # compiled output (gitignored)
```

## Adding support for new operators

1. Add the evaluation logic in `typeormQueryMatcher` inside `src/typeorm-query-matcher.ts`.
2. Add a test case in `src/__tests__/typeorm-query-matcher.test.ts`.
3. Run `pnpm test` to verify.

## Commit style

Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Submitting a pull request

1. Fork and create a branch from `main`.
2. Make your changes with tests.
3. Run `pnpm test` — all tests must pass.
4. Open a pull request against `main` with a clear description of what changed and why.
