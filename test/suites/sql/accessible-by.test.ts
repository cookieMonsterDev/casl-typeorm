import { type AnyAbility, subject } from '@casl/ability';
import { Between, type DataSource, In, IsNull, Like, MoreThan, Not } from 'typeorm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  accessibleBy,
  CaslTypeOrmError,
  createTypeOrmAbility,
  type TypeOrmRawRule,
  UnsupportedConditionError,
} from '../../../src';
import { Article } from '../../fixtures/sql-entities';
import { seedSql, type SqlSeed } from '../../fixtures/sql-seed';
import { createSqlDataSource, describeIfSql } from '../../helpers';

interface Scenario {
  name: string;
  rules: (seed: SqlSeed) => TypeOrmRawRule[];
  /** Titles the scenario must grant; also cross-checked against `ability.can()` on loaded entities. */
  expected: string[];
  /** `ofType()` cannot express negated relation conditions and must throw instead. */
  findUnsupported?: boolean;
}

const ALL = [
  'alice-public',
  'alice-secret',
  'bob-draft',
  'bob-tech',
  'carol-banned',
  'carol-archived',
  'dave-secret-only',
  'dave-internal-only',
  'orphan',
  'orphan-classified',
];
const except = (...titles: string[]): string[] => ALL.filter((title) => !titles.includes(title));

const scenarios: Scenario[] = [
  { name: 'no rules', rules: () => [], expected: [] },
  { name: 'manage all', rules: () => [{ action: 'manage', subject: 'all' }], expected: ALL },
  {
    name: 'scalar equality',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { published: true } }],
    expected: except('bob-draft'),
  },
  {
    name: 'two can rules are OR',
    rules: ({ users }) => [
      { action: 'read', subject: 'Article', conditions: { status: 'draft' } },
      { action: 'read', subject: 'Article', conditions: { authorId: users.alice.id } },
    ],
    expected: ['alice-public', 'alice-secret', 'bob-draft'],
  },
  {
    name: 'can with scalar cannot',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { published: true } },
      { action: 'read', subject: 'Article', conditions: { secret: true }, inverted: true },
    ],
    expected: except('bob-draft', 'alice-secret', 'dave-secret-only'),
  },
  {
    name: 'multi-field cannot (NOT (secret AND internal))',
    rules: () => [
      { action: 'read', subject: 'Article' },
      { action: 'read', subject: 'Article', conditions: { secret: true, internal: true }, inverted: true },
    ],
    expected: except('alice-secret'),
  },
  {
    name: 'same field constrained by can and cannot',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { status: In(['draft', 'published', 'archived']) } },
      { action: 'read', subject: 'Article', conditions: { status: 'draft' }, inverted: true },
    ],
    expected: except('bob-draft', 'carol-banned'),
  },
  {
    name: 'operators: MoreThan, Between, Like, IsNull, Not(IsNull)',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { views: MoreThan(100), title: Like('%-%') } },
      { action: 'read', subject: 'Article', conditions: { views: Between(1, 10), deletedReason: IsNull() } },
      { action: 'read', subject: 'Article', conditions: { deletedReason: Not(IsNull()) } },
    ],
    expected: ['alice-public', 'bob-tech', 'carol-banned', 'bob-draft', 'orphan', 'dave-internal-only'],
  },
  {
    name: 'null means IS NULL and arrays mean IN, in can and cannot rules',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { deletedReason: null, status: ['published', 'archived'] } },
      { action: 'read', subject: 'Article', conditions: { authorId: null }, inverted: true },
    ],
    expected: except('bob-draft', 'carol-banned', 'dave-internal-only', 'orphan', 'orphan-classified'),
  },
  {
    name: 'date comparison',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { createdAt: MoreThan(new Date(Date.UTC(2024, 0, 8))) } },
    ],
    expected: ['carol-banned', 'carol-archived', 'orphan', 'orphan-classified'],
  },
  {
    name: 'embedded column',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { meta: { locale: 'en', revision: 1 } } }],
    expected: except('bob-tech', 'orphan'),
  },
  {
    name: 'many-to-one condition',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { author: { isVerified: true } } }],
    expected: except('carol-banned', 'carol-archived', 'orphan', 'orphan-classified'),
  },
  {
    name: 'many-to-one by id',
    rules: ({ users }) => [{ action: 'read', subject: 'Article', conditions: { author: { id: users.bob.id } } }],
    expected: ['bob-draft', 'bob-tech'],
  },
  {
    name: 'two levels deep (author.profile)',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { author: { profile: { country: 'UA' } } } }],
    expected: ['alice-public', 'alice-secret'],
  },
  {
    name: 'one-to-many EXISTS',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { comments: { approved: true } } }],
    expected: ['alice-public', 'bob-tech', 'orphan'],
  },
  {
    name: 'one-to-many nested to-one (comments.author)',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { comments: { author: { role: 'admin' } } } }],
    expected: ['bob-tech'],
  },
  {
    name: 'many-to-many EXISTS',
    rules: () => [{ action: 'read', subject: 'Article', conditions: { categories: { restricted: true } } }],
    expected: ['alice-secret', 'orphan-classified'],
  },
  {
    name: 'relation OR list',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { author: [{ role: 'admin' }, { name: 'dave' }] } },
    ],
    expected: ['alice-public', 'alice-secret', 'dave-secret-only', 'dave-internal-only'],
  },
  {
    name: 'cannot on many-to-one keeps rows without the relation',
    rules: () => [
      { action: 'read', subject: 'Article' },
      { action: 'read', subject: 'Article', conditions: { author: { banned: true } }, inverted: true },
    ],
    expected: except('carol-banned', 'carol-archived'),
    findUnsupported: true,
  },
  {
    name: 'cannot on one-to-many is NOT EXISTS',
    rules: () => [
      { action: 'read', subject: 'Article', conditions: { published: true } },
      { action: 'read', subject: 'Article', conditions: { comments: { body: Like('%spam%') } }, inverted: true },
    ],
    expected: except('bob-draft', 'alice-public', 'bob-tech'),
    findUnsupported: true,
  },
  {
    name: 'cannot on many-to-many',
    rules: () => [
      { action: 'read', subject: 'Article' },
      { action: 'read', subject: 'Article', conditions: { categories: { restricted: true } }, inverted: true },
    ],
    expected: except('alice-secret', 'orphan-classified'),
    findUnsupported: true,
  },
  {
    name: 'cannot two levels deep',
    rules: () => [
      { action: 'read', subject: 'Article' },
      { action: 'read', subject: 'Article', conditions: { author: { profile: { country: 'DE' } } }, inverted: true },
    ],
    expected: except('bob-draft', 'bob-tech'),
    findUnsupported: true,
  },
  {
    name: 'mixed can/cannot on scalars and relations',
    rules: ({ users }) => [
      { action: 'read', subject: 'Article', conditions: { published: true } },
      { action: 'read', subject: 'Article', conditions: { authorId: users.dave.id } },
      { action: 'read', subject: 'Article', conditions: { secret: true }, inverted: true },
      {
        action: 'read',
        subject: 'Article',
        conditions: { author: { banned: true }, status: 'banned' },
        inverted: true,
      },
    ],
    expected: except('bob-draft', 'alice-secret', 'dave-secret-only', 'carol-banned'),
    findUnsupported: true,
  },
];

function expectedFindOutcome(scenario: Scenario, expected: string[]): object {
  return scenario.findUnsupported ? { error: expect.any(UnsupportedConditionError) } : { titles: expected };
}

describeIfSql('accessibleBy on a SQL database', () => {
  let dataSource: DataSource;
  let seed: SqlSeed;
  let loaded: Article[];

  beforeAll(async () => {
    dataSource = await createSqlDataSource();
    seed = await seedSql(dataSource);
    loaded = await dataSource.getRepository(Article).find({
      relations: { author: { profile: true }, comments: { author: true }, categories: true },
      order: { id: 'ASC' },
    });
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  function titlesFromOracle(ability: AnyAbility): string[] {
    return loaded.filter((article) => ability.can('read', subject('Article', article))).map((a) => a.title);
  }

  async function titlesFromQueryBuilder(ability: AnyAbility): Promise<string[]> {
    const qb = dataSource.getRepository(Article).createQueryBuilder('article');
    accessibleBy(ability, 'read').applyTo(qb);
    const rows = await qb.orderBy('article.id', 'ASC').getMany();
    return rows.map((a) => a.title);
  }

  async function titlesFromFind(ability: AnyAbility): Promise<string[]> {
    const where = accessibleBy(ability, 'read').ofType<Article>('Article');
    if (where === null) return [];
    const rows = await dataSource.getRepository(Article).find({ where, order: { id: 'ASC' } });
    return rows.map((a) => a.title);
  }

  for (const scenario of scenarios) {
    it(`${scenario.name}: query builder, find() and ability.can() agree`, async () => {
      const ability = createTypeOrmAbility(scenario.rules(seed));
      const expected = ALL.filter((title) => scenario.expected.includes(title));

      expect(titlesFromOracle(ability)).toEqual(expected);
      await expect(titlesFromQueryBuilder(ability)).resolves.toEqual(expected);

      const findOutcome = await titlesFromFind(ability).then(
        (titles) => ({ titles }),
        (error: unknown) => ({ error }),
      );
      expect(findOutcome).toEqual(expectedFindOutcome(scenario, expected));
    });
  }

  it('keeps existing where clauses and supports pagination and counting', async () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Article' },
      { action: 'read', subject: 'Article', conditions: { author: { banned: true } }, inverted: true },
    ]);
    const qb = dataSource
      .getRepository(Article)
      .createQueryBuilder('article')
      .where('article.views > :views', { views: 0 })
      .orderBy('article.id', 'ASC');
    accessibleBy(ability).applyTo(qb);

    await expect(qb.getCount()).resolves.toBe(6);
    const page = await qb.clone().take(2).skip(2).getMany();
    expect(page.map((a) => a.title)).toEqual(['bob-tech', 'dave-secret-only']);
  });

  it('adds EXISTS / NOT EXISTS subqueries with bound parameters', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Article', conditions: { author: { isVerified: true } } },
      { action: 'read', subject: 'Article', conditions: { comments: { body: Like('%spam%') } }, inverted: true },
    ]);
    const qb = accessibleBy(ability).applyTo(dataSource.getRepository(Article).createQueryBuilder('article'));
    const [sql, parameters] = qb.getQueryAndParameters();

    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM .*casl_author_1/);
    expect(sql).toMatch(/NOT\(+EXISTS \(SELECT 1 FROM .*casl_comments_2/);
    // Drivers bind booleans differently (sqlite uses 1), so only the string parameter is asserted.
    expect(parameters).toHaveLength(2);
    expect(parameters).toContain('%spam%');
  });

  it('uses the entity class as subject type when the ability has rules for it', async () => {
    const ability = createTypeOrmAbility([{ action: 'read', subject: Article, conditions: { status: 'draft' } }]);
    const rows = await accessibleBy(ability)
      .applyTo(dataSource.getRepository(Article).createQueryBuilder('a'))
      .getMany();
    expect(rows.map((a) => a.title)).toEqual(['bob-draft']);
  });

  it('accepts an explicit subject type', async () => {
    const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', conditions: { status: 'draft' } }]);
    const qb = dataSource.getRepository(Article).createQueryBuilder('a');
    const rows = await accessibleBy(ability).applyTo(qb, { subjectType: 'Post' }).getMany();
    expect(rows.map((a) => a.title)).toEqual(['bob-draft']);
  });

  it('rejects query builders that select a raw table instead of an entity', () => {
    const ability = createTypeOrmAbility([{ action: 'read', subject: 'Article' }]);
    const qb = dataSource.createQueryBuilder().select('*').from('not_an_entity', 'raw');
    expect(() => accessibleBy(ability).applyTo(qb)).toThrow(CaslTypeOrmError);
    expect(() => accessibleBy(ability).applyTo(qb)).toThrow(/selects an entity/);
  });

  it('rejects unknown properties with a clear error', () => {
    const ability = createTypeOrmAbility([{ action: 'read', subject: 'Article', conditions: { nope: 1 } }]);
    expect(() => accessibleBy(ability).applyTo(dataSource.getRepository(Article).createQueryBuilder('a'))).toThrow(
      /Property "nope" was not found in entity "Article"/,
    );
  });
});
