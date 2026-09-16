import { DataSource } from 'typeorm';
import { describe, it } from 'vitest';
import { MONGO_ENTITIES } from '../fixtures/mongo-entities';
import { POSTGRES_ENTITIES } from '../fixtures/postgres-entities';
import { SQL_ENTITIES } from '../fixtures/sql-entities';
import { type DbName, dataSourceOptions, getDb, isMongo, isSql } from './db';

export * from './db';

export const describeIfSql = isSql() ? describe : describe.skip;
export const describeIfMongo = isMongo() ? describe : describe.skip;

/** Runs the test only on the listed databases; use for driver-specific operators. */
export function testIfDb(...dbs: DbName[]): ReturnType<typeof it.skipIf> {
  return it.skipIf(!dbs.includes(getDb()));
}

/** Runs the suite only on the listed databases. */
export function describeIfDb(...dbs: DbName[]): ReturnType<typeof describe.skipIf> {
  return describe.skipIf(!dbs.includes(getDb()));
}

export async function createSqlDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    ...dataSourceOptions(),
    entities: getDb() === 'postgres' ? [...SQL_ENTITIES, ...POSTGRES_ENTITIES] : SQL_ENTITIES,
    synchronize: true,
    dropSchema: true,
  });
  return dataSource.initialize();
}

export async function createMongoDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({ ...dataSourceOptions(), entities: MONGO_ENTITIES });
  return dataSource.initialize();
}
