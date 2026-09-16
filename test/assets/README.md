# Integration database assets

Integration tests (`pnpm test:integration`) run against the database selected by `DB`. SQLite runs in-process through
`better-sqlite3`; every other database is started with Docker Compose from one of the files in this directory.

```sh
pnpm test:integration                         # DB=sqlite (default), no Docker
DB=postgres pnpm test:integration             # PostgreSQL 17
DB=postgres DB_VERSION=15 pnpm test:integration
DB=mysql pnpm test:integration                # MySQL 9
DB=mysql DB_VERSION=8 pnpm test:integration
DB=mssql pnpm test:integration                # SQL Server 2022
DB=mongodb pnpm test:integration              # MongoDB 8.2
```

`test/helpers/db.ts`, `scripts/compose-up.sh`, `scripts/compose-down.sh` and `scripts/compose-pull.sh` resolve the same
mapping. `COMPOSE_FILE` overrides it for a one-off stack.

## Database → compose file

| `DB`       | `DB_VERSION`     | Compose file                     | Image                                        | Host port |
| ---------- | ---------------- | -------------------------------- | -------------------------------------------- | --------- |
| `sqlite`   | —                | none (in-memory)                 | —                                            | —         |
| `postgres` | `17` (default)   | `docker-compose.postgres-17.yml` | `postgres:17`                                | 55432     |
| `postgres` | `15`             | `docker-compose.postgres-15.yml` | `postgres:15`                                | 55432     |
| `mysql`    | `9` (default)    | `docker-compose.mysql-9.yml`     | `mysql:9`                                    | 53306     |
| `mysql`    | `8`              | `docker-compose.mysql-8.yml`     | `mysql:8`                                    | 53306     |
| `mssql`    | `2022` (default) | `docker-compose.mssql-2022.yml`  | `mcr.microsoft.com/mssql/server:2022-latest` | 51433     |
| `mongodb`  | `8` (default)    | `docker-compose.mongodb-8.yml`   | `mongo:8.2`                                  | 57017     |

Credentials and ports live in `test/helpers/db.ts` (`dataSourceOptions`) and must match the compose files. Each file
sets a distinct project `name`, a healthcheck that `docker compose up --wait` blocks on, and `custom.project` /
`custom.service` labels.

Notes:

- SQL Server ships an amd64-only image; the compose file pins `platform: linux/amd64`, which Docker Desktop on Apple
  Silicon emulates (slow start, hence the long `start_period`). Tests use the `master` database.
- MongoDB 8.0 refuses to start on Linux kernels 6.19 and newer ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)),
  which recent Docker Desktop versions ship, so the `8` entry uses the `mongo:8.2` image.
- MySQL 9 dropped `mysql_native_password`; the `mysql2` driver negotiates `caching_sha2_password` without extra config.

## Gates

Import from `test/helpers`:

- `describeIfSql` / `describeIfMongo` — whole suites for SQL databases or MongoDB.
- `testIfDb('postgres', 'mysql')` — a single test for the listed databases (e.g. PostgreSQL array or JSONB operators).

Do not parse `DB` in a test file.

## Other environment variables

| Variable        | Effect                                                         |
| --------------- | -------------------------------------------------------------- |
| `DB_EXTERNAL=1` | Skip `compose up`/`down` (database already running)            |
| `DO_NOT_STOP=1` | Leave the container running after the run                      |
| `TEST_RETRIES`  | Vitest retry count for the integration project (CI uses `2`)   |
| `COMPOSE_FILE`  | Absolute or relative path to a compose file; skips the mapping |

## CI

`.github/workflows/ci.yml` runs a Docker-free job (format, commitlint, lint, typecheck, unit tests, build, sqlite
integration) followed by an integration matrix over `postgres`, `mysql`, `mssql` and `mongodb` at their default versions.
Docker images are cached per database with `docker save`/`docker load`.
