import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';

export type DbName = 'sqlite' | 'postgres' | 'mysql' | 'mssql' | 'mongodb';

export const DEFAULT_DB: DbName = 'sqlite';
export const DB_NAMES: readonly DbName[] = ['sqlite', 'postgres', 'mysql', 'mssql', 'mongodb'];

/**
 * Integration matrix. `DB` selects the database, `DB_VERSION` one of its compose files (the first
 * entry is the default); `COMPOSE_FILE` overrides both. Mirrored in scripts/resolve-compose-file.sh.
 * @see ../assets/README.md
 */
export const DB_COMPOSE_FILES: Readonly<Record<Exclude<DbName, 'sqlite'>, ReadonlyArray<readonly [string, string]>>> = {
  // Arrays, not objects: JS enumerates integer-like keys in ascending order, which would make the
  // oldest version the default.
  postgres: [
    ['17', 'docker-compose.postgres-17.yml'],
    ['15', 'docker-compose.postgres-15.yml'],
  ],
  mysql: [
    ['9', 'docker-compose.mysql-9.yml'],
    ['8', 'docker-compose.mysql-8.yml'],
  ],
  mssql: [['2022', 'docker-compose.mssql-2022.yml']],
  mongodb: [['8', 'docker-compose.mongodb-8.yml']],
};

export function getDb(env: NodeJS.ProcessEnv = process.env): DbName {
  const raw = env.DB?.trim().toLowerCase();
  if (!raw) return DEFAULT_DB;
  if (!DB_NAMES.includes(raw as DbName)) {
    throw new Error(`Unsupported DB=${raw}. Known databases: ${DB_NAMES.join(', ')}`);
  }
  return raw as DbName;
}

export function isMongo(db: DbName = getDb()): boolean {
  return db === 'mongodb';
}

export function isSql(db: DbName = getDb()): boolean {
  return !isMongo(db);
}

function assetsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
}

/** Compose file for the selected database, or `null` when it runs in-process (sqlite). */
export function resolveComposeFile(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.COMPOSE_FILE) {
    return path.isAbsolute(env.COMPOSE_FILE) ? env.COMPOSE_FILE : path.resolve(env.COMPOSE_FILE);
  }
  const db = getDb(env);
  if (db === 'sqlite') return null;

  const files = DB_COMPOSE_FILES[db];
  const versions = files.map(([version]) => version);
  const version = env.DB_VERSION?.trim() || versions[0]!;
  const fileName = files.find(([candidate]) => candidate === version)?.[1];
  if (!fileName) {
    throw new Error(`Unsupported DB_VERSION=${version} for DB=${db}. Known versions: ${versions.join(', ')}`);
  }
  const filePath = path.join(assetsDir(), fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Compose file ${fileName} for DB=${db} DB_VERSION=${version} is missing from test/assets.`);
  }
  return filePath;
}

/** Connection options matching the ports and credentials in test/assets/docker-compose.*.yml. */
export function dataSourceOptions(db: DbName = getDb()): DataSourceOptions {
  switch (db) {
    case 'sqlite':
      return { type: 'better-sqlite3', database: ':memory:' };
    case 'postgres':
      return { type: 'postgres', host: '127.0.0.1', port: 55432, username: 'casl', password: 'casl', database: 'casl' };
    case 'mysql':
      return { type: 'mysql', host: '127.0.0.1', port: 53306, username: 'casl', password: 'casl', database: 'casl' };
    case 'mssql':
      return {
        type: 'mssql',
        host: '127.0.0.1',
        port: 51433,
        username: 'sa',
        password: 'Casl_Typeorm_1!',
        database: 'master',
        options: { encrypt: false, trustServerCertificate: true },
      };
    case 'mongodb':
      return { type: 'mongodb', url: 'mongodb://127.0.0.1:57017/casl' };
  }
}
