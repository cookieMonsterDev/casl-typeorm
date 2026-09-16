import type { DataSource } from 'typeorm';
import { Article, Category, Comment, Profile, User } from './sql-entities';

export interface SqlSeed {
  users: Record<'alice' | 'bob' | 'carol' | 'dave', User>;
  categories: Record<'news' | 'tech' | 'classified', Category>;
  articles: Article[];
}

/** Deterministic dataset; every relation kind is covered so rule scenarios can target each. */
export async function seedSql(dataSource: DataSource): Promise<SqlSeed> {
  const users = dataSource.getRepository(User);
  const profiles = dataSource.getRepository(Profile);
  const categories = dataSource.getRepository(Category);
  const articles = dataSource.getRepository(Article);
  const comments = dataSource.getRepository(Comment);

  const [alice, bob, carol, dave] = (await users.save([
    users.create({ name: 'alice', role: 'admin', isVerified: true, banned: false }),
    users.create({ name: 'bob', role: 'editor', isVerified: true, banned: false }),
    users.create({ name: 'carol', role: 'viewer', isVerified: false, banned: true }),
    users.create({ name: 'dave', role: 'editor', isVerified: true, banned: false }),
  ])) as [User, User, User, User];

  await profiles.save([
    profiles.create({ country: 'UA', bio: 'admin of things', user: alice }),
    profiles.create({ country: 'DE', bio: null, user: bob }),
  ]);

  const [news, tech, classified] = (await categories.save([
    categories.create({ name: 'news', restricted: false }),
    categories.create({ name: 'tech', restricted: false }),
    categories.create({ name: 'classified', restricted: true }),
  ])) as [Category, Category, Category];

  const day = (n: number): Date => new Date(Date.UTC(2024, 0, n, 12, 0, 0));
  const article = (fields: Partial<Article> & { title: string; author: User | null }): Article =>
    articles.create({
      status: 'published',
      views: 0,
      published: true,
      secret: false,
      internal: false,
      deletedReason: null,
      createdAt: day(1),
      meta: { locale: 'en', revision: 1 },
      categories: [],
      ...fields,
      authorId: fields.author?.id ?? null,
    });

  const saved = await articles.save([
    article({ title: 'alice-public', author: alice, views: 500, categories: [news] }),
    article({ title: 'alice-secret', author: alice, secret: true, internal: true, categories: [classified] }),
    article({ title: 'bob-draft', author: bob, status: 'draft', published: false, views: 3, createdAt: day(5) }),
    article({
      title: 'bob-tech',
      author: bob,
      views: 120,
      categories: [tech, news],
      meta: { locale: 'de', revision: 4 },
    }),
    article({ title: 'carol-banned', author: carol, status: 'banned', views: 9000, createdAt: day(9) }),
    article({ title: 'carol-archived', author: carol, status: 'archived', internal: true, createdAt: day(12) }),
    article({ title: 'dave-secret-only', author: dave, secret: true, views: 42, categories: [tech] }),
    article({ title: 'dave-internal-only', author: dave, internal: true, views: 7, deletedReason: 'duplicate' }),
    article({ title: 'orphan', author: null, views: 1, createdAt: day(20), meta: { locale: 'fr', revision: 2 } }),
    article({ title: 'orphan-classified', author: null, categories: [classified, tech], createdAt: day(25) }),
  ]);

  const byTitle = (title: string): Article => saved.find((a) => a.title === title)!;
  await comments.save([
    comments.create({
      body: 'great read',
      approved: true,
      article: byTitle('alice-public'),
      author: bob,
      authorId: bob.id,
    }),
    comments.create({
      body: 'spam spam',
      approved: false,
      article: byTitle('alice-public'),
      author: carol,
      authorId: carol.id,
    }),
    comments.create({
      body: 'first!',
      approved: true,
      article: byTitle('bob-tech'),
      author: alice,
      authorId: alice.id,
    }),
    comments.create({
      body: 'buy spam now',
      approved: true,
      article: byTitle('bob-tech'),
      author: carol,
      authorId: carol.id,
    }),
    comments.create({
      body: 'pending',
      approved: false,
      article: byTitle('dave-secret-only'),
      author: dave,
      authorId: dave.id,
    }),
    comments.create({ body: 'why?', approved: true, article: byTitle('orphan'), author: dave, authorId: dave.id }),
  ]);

  return { users: { alice, bob, carol, dave }, categories: { news, tech, classified }, articles: saved };
}
