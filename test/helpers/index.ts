import { DataSource } from 'typeorm';
import { describe, it } from 'vitest';
import { SQL_ENTITIES } from '../fixtures/sql-entities';
import { type DbName, dataSourceOptions, getDb, isMongo, isSql } from './db';

export * from './db';

export const describeIfSql = isSql() ? describe : describe.skip;
export const describeIfMongo = isMongo() ? describe : describe.skip;

/** Runs the test only on the listed databases; use for driver-specific operators. */
export function testIfDb(...dbs: DbName[]): ReturnType<typeof it.skipIf> {
  return it.skipIf(!dbs.includes(getDb()));
}

export async function createSqlDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    ...dataSourceOptions(),
    entities: SQL_ENTITIES,
    synchronize: true,
    dropSchema: true,
  });
  return dataSource.initialize();
}
