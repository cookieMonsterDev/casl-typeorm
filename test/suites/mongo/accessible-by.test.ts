import { type AnyAbility, subject } from '@casl/ability';
import { Between, type DataSource, In, ArrayContains, IsNull, Like, MoreThan, Not } from 'typeorm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { accessibleBy, accessibleRecords, createTypeOrmAbility, type TypeOrmRawRule } from '../../../src';
import { Post } from '../../fixtures/mongo-entities';
import { seedMongo } from '../../fixtures/mongo-seed';
import { createMongoDataSource, describeIfMongo } from '../../helpers';

interface Scenario {
  name: string;
  rules: (posts: Post[]) => TypeOrmRawRule[];
  expected: string[];
}

const ALL = ['alice-public', 'alice-secret', 'bob-draft', 'bob-tech', 'carol-banned', 'dave-secret-only', 'orphan'];
const except = (...titles: string[]): string[] => ALL.filter((title) => !titles.includes(title));

const scenarios: Scenario[] = [
  { name: 'no rules', rules: () => [], expected: [] },
  { name: 'manage all', rules: () => [{ action: 'manage', subject: 'all' }], expected: ALL },
  {
    name: 'scalar equality and OR',
    rules: () => [
      { action: 'read', subject: 'Post', conditions: { status: 'draft' } },
      { action: 'read', subject: 'Post', conditions: { secret: true } },
    ],
    expected: ['alice-secret', 'bob-draft', 'dave-secret-only'],
  },
  {
    name: 'by ObjectId column',
    rules: (posts) => [{ action: 'read', subject: 'Post', conditions: { id: posts[3]!.id } }],
    expected: ['bob-tech'],
  },
  {
    name: 'multi-field cannot',
    rules: () => [
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { secret: true, internal: true }, inverted: true },
    ],
    expected: except('alice-secret'),
  },
  {
    name: 'operators',
    rules: () => [
      { action: 'read', subject: 'Post', conditions: { views: MoreThan(100), title: Like('%-%') } },
      { action: 'read', subject: 'Post', conditions: { views: Between(1, 10), status: In(['draft', 'published']) } },
      { action: 'read', subject: 'Post', conditions: { createdAt: MoreThan(new Date(Date.UTC(2024, 0, 15))) } },
    ],
    expected: ['alice-public', 'bob-draft', 'bob-tech', 'carol-banned', 'orphan'],
  },
  {
    name: 'embedded document and cannot on embedded document',
    rules: () => [
      { action: 'read', subject: 'Post', conditions: { meta: { locale: 'en' } } },
      { action: 'read', subject: 'Post', conditions: { author: { banned: true } }, inverted: true },
    ],
    expected: except('bob-tech', 'orphan', 'carol-banned'),
  },
  {
    name: 'null embedded document',
    rules: () => [
      { action: 'read', subject: 'Post', conditions: { author: IsNull() } },
      { action: 'read', subject: 'Post', conditions: { author: { name: 'bob' } } },
    ],
    expected: ['bob-draft', 'bob-tech', 'orphan'],
  },
  {
    name: 'array column and Not',
    rules: () => [
      { action: 'read', subject: 'Post', conditions: { tags: ArrayContains(['tech']) } },
      { action: 'read', subject: 'Post', conditions: { status: Not('published') } },
    ],
    expected: ['bob-draft', 'bob-tech', 'carol-banned', 'dave-secret-only'],
  },
];

describeIfMongo('accessibleBy on MongoDB', () => {
  let dataSource: DataSource;
  let posts: Post[];

  beforeAll(async () => {
    dataSource = await createMongoDataSource();
    posts = await seedMongo(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  function titlesFromOracle(ability: AnyAbility): string[] {
    return posts.filter((post) => ability.can('read', subject('Post', post))).map((post) => post.title);
  }

  async function titlesFromFind(ability: AnyAbility): Promise<string[]> {
    const repository = dataSource.getMongoRepository(Post);
    const where = accessibleBy(ability).toMongoQuery('Post', repository.metadata);
    if (where === null) return [];
    const rows = await repository.find({ where, order: { title: 'ASC' } });
    return rows.map((post) => post.title);
  }

  for (const scenario of scenarios) {
    it(`${scenario.name}: find() and ability.can() agree`, async () => {
      // Embedded documents may be absent on Mongo documents; treat them as null instead of "not loaded".
      const ability = createTypeOrmAbility(scenario.rules(posts), { unloadedRelation: 'deny' });
      const expected = [...scenario.expected].sort();

      expect(titlesFromOracle(ability).sort()).toEqual(expected);
      await expect(titlesFromFind(ability)).resolves.toEqual(expected);
    });
  }

  it('findAccessible() merges the caller where clause and options', async () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
    ]);
    const repository = dataSource.getMongoRepository(Post).extend(accessibleRecords);
    const rows = await repository.findAccessible(ability, 'read', {
      where: { views: { $gt: 0 } },
      order: { views: 'DESC' },
      take: 2,
    });
    expect(rows.map((post) => post.title)).toEqual(['carol-banned', 'alice-public']);
  });

  it('accessibleBy() on a Mongo repository explains that query builders are unavailable', () => {
    const repository = dataSource.getMongoRepository(Post).extend(accessibleRecords);
    expect(() => repository.accessibleBy(createTypeOrmAbility([]))).toThrow(/not available for MongoDB/);
  });
});
