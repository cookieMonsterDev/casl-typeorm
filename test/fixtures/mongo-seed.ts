import type { DataSource } from 'typeorm';
import { Post } from './mongo-entities';

export async function seedMongo(dataSource: DataSource): Promise<Post[]> {
  const posts = dataSource.getMongoRepository(Post);
  await posts.deleteMany({});

  const day = (n: number): Date => new Date(Date.UTC(2024, 0, n, 12, 0, 0));
  const post = (fields: Partial<Post> & { title: string }): Post =>
    posts.create({
      status: 'published',
      views: 0,
      secret: false,
      internal: false,
      tags: [],
      createdAt: day(1),
      meta: { locale: 'en', revision: 1 },
      author: { name: 'alice', banned: false },
      ...fields,
    });

  return posts.save([
    post({ title: 'alice-public', views: 500, tags: ['news'] }),
    post({ title: 'alice-secret', secret: true, internal: true, tags: ['classified'] }),
    post({ title: 'bob-draft', status: 'draft', views: 3, createdAt: day(5), author: { name: 'bob', banned: false } }),
    post({
      title: 'bob-tech',
      views: 120,
      tags: ['tech', 'news'],
      meta: { locale: 'de', revision: 4 },
      author: { name: 'bob', banned: false },
    }),
    post({
      title: 'carol-banned',
      status: 'banned',
      views: 9000,
      createdAt: day(9),
      author: { name: 'carol', banned: true },
    }),
    post({
      title: 'dave-secret-only',
      secret: true,
      views: 42,
      tags: ['tech'],
      author: { name: 'dave', banned: false },
    }),
    post({ title: 'orphan', views: 1, createdAt: day(20), meta: { locale: 'fr', revision: 2 }, author: null }),
  ]);
}
