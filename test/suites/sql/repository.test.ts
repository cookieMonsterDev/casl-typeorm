import { type DataSource, Like } from 'typeorm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { accessibleRecords, createTypeOrmAbility } from '../../../src';
import { Article } from '../../fixtures/sql-entities';
import { seedSql, type SqlSeed } from '../../fixtures/sql-seed';
import { createSqlDataSource, describeIfSql } from '../../helpers';

describeIfSql('accessibleRecords repository extension', () => {
  let dataSource: DataSource;
  let seed: SqlSeed;

  beforeAll(async () => {
    dataSource = await createSqlDataSource();
    seed = await seedSql(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const ability = () =>
    createTypeOrmAbility([
      { action: 'read', subject: 'Article', conditions: { published: true } },
      { action: 'read', subject: 'Article', conditions: { author: { banned: true } }, inverted: true },
      { action: 'update', subject: 'Article', conditions: { author: { role: 'editor' } } },
    ]);

  it('accessibleBy() returns a filtered query builder with the entity name as default alias', async () => {
    const articles = dataSource.getRepository(Article).extend(accessibleRecords);
    const qb = articles.accessibleBy(ability());
    expect(qb.alias).toBe('Article');

    const rows = await qb.orderBy('Article.id', 'ASC').getMany();
    expect(rows.map((a) => a.title)).toEqual([
      'alice-public',
      'alice-secret',
      'bob-tech',
      'dave-secret-only',
      'dave-internal-only',
      'orphan',
      'orphan-classified',
    ]);
  });

  it('accessibleBy() honours the action and a custom alias', async () => {
    const articles = dataSource.getRepository(Article).extend(accessibleRecords);
    const rows = await articles.accessibleBy(ability(), 'update', 'a').orderBy('a.title', 'ASC').getMany();
    expect(rows.map((a) => a.title)).toEqual(['bob-draft', 'bob-tech', 'dave-internal-only', 'dave-secret-only']);
  });

  it('findAccessible() combines the caller options with the ability', async () => {
    const articles = dataSource.getRepository(Article).extend(accessibleRecords);
    const rows = await articles.findAccessible(ability(), 'read', {
      where: { title: Like('%-%') },
      relations: { author: true, categories: true },
      order: { views: 'DESC' },
      take: 2,
      skip: 1,
    });
    expect(rows.map((a) => a.title)).toEqual(['bob-tech', 'dave-secret-only']);
    expect(rows[0]!.author?.name).toBe('bob');
    expect(rows[0]!.categories.map((c) => c.name).sort()).toEqual(['news', 'tech']);
    expect(seed.users.bob.id).toBe(rows[0]!.authorId);
  });

  it('findAccessible() returns nothing when the ability grants no access', async () => {
    const articles = dataSource.getRepository(Article).extend(accessibleRecords);
    await expect(articles.findAccessible(createTypeOrmAbility([]))).resolves.toEqual([]);
  });
});
