import { type AnyAbility, subject } from '@casl/ability';
import { ArrayContainedBy, ArrayContains, ArrayOverlap, type DataSource, JsonContains } from 'typeorm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { accessibleBy, createTypeOrmAbility, type TypeOrmRawRule } from '../../../src';
import { Tagged } from '../../fixtures/postgres-entities';
import { createSqlDataSource, describeIfDb } from '../../helpers';

describeIfDb('postgres')('PostgreSQL array and JSONB operators', () => {
  let dataSource: DataSource;
  let rows: Tagged[];

  beforeAll(async () => {
    dataSource = await createSqlDataSource();
    const repository = dataSource.getRepository(Tagged);
    rows = await repository.save([
      repository.create({ name: 'a', tags: ['news', 'tech'], payload: { level: 1, flags: { hot: true } } }),
      repository.create({ name: 'b', tags: ['tech'], payload: { level: 2, flags: { hot: false } } }),
      repository.create({ name: 'c', tags: [], payload: { level: 1, flags: {} } }),
    ]);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  async function namesFromAllBackends(rules: TypeOrmRawRule[]): Promise<string[][]> {
    const ability: AnyAbility = createTypeOrmAbility(rules);
    const repository = dataSource.getRepository(Tagged);
    const fromQueryBuilder = await accessibleBy(ability)
      .applyTo(repository.createQueryBuilder('t'))
      .orderBy('t.id')
      .getMany();
    const fromFind = await repository.find({
      where: accessibleBy(ability).ofType<Tagged>('Tagged')!,
      order: { id: 'ASC' },
    });
    const fromOracle = rows.filter((row) => ability.can('read', subject('Tagged', row)));
    return [fromQueryBuilder, fromFind, fromOracle].map((list) => list.map((row) => row.name));
  }

  it('ArrayContains, ArrayContainedBy and ArrayOverlap agree across backends', async () => {
    const [qb, find, oracle] = await namesFromAllBackends([
      { action: 'read', subject: 'Tagged', conditions: { tags: ArrayContains(['tech']) } },
      { action: 'read', subject: 'Tagged', conditions: { tags: ArrayOverlap(['news']) }, inverted: true },
    ]);
    expect(qb).toEqual(['b']);
    expect(find).toEqual(qb);
    expect(oracle).toEqual(qb);

    const [qb2, find2, oracle2] = await namesFromAllBackends([
      { action: 'read', subject: 'Tagged', conditions: { tags: ArrayContainedBy(['tech', 'other']) } },
    ]);
    expect(qb2).toEqual(['b', 'c']);
    expect(find2).toEqual(qb2);
    expect(oracle2).toEqual(qb2);
  });

  it('JsonContains agrees across backends', async () => {
    const [qb, find, oracle] = await namesFromAllBackends([
      { action: 'read', subject: 'Tagged', conditions: { payload: JsonContains({ level: 1 }) } },
      {
        action: 'read',
        subject: 'Tagged',
        conditions: { payload: JsonContains({ flags: { hot: true } }) },
        inverted: true,
      },
    ]);
    expect(qb).toEqual(['c']);
    expect(find).toEqual(qb);
    expect(oracle).toEqual(qb);
  });
});
