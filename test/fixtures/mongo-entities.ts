import type { ObjectId } from 'mongodb';
import { Column, Entity, ObjectIdColumn } from 'typeorm';

export class PostMeta {
  @Column({ type: 'varchar' })
  locale!: string;

  @Column({ type: 'int' })
  revision!: number;
}

export class PostAuthor {
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: Boolean })
  banned!: boolean;
}

@Entity()
export class Post {
  @ObjectIdColumn()
  id!: ObjectId;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'varchar' })
  status!: 'draft' | 'published' | 'banned';

  @Column({ type: 'int' })
  views!: number;

  @Column({ type: Boolean })
  secret!: boolean;

  @Column({ type: Boolean })
  internal!: boolean;

  @Column({ type: 'array' })
  tags!: string[];

  @Column({ type: Date })
  createdAt!: Date;

  @Column(() => PostMeta)
  meta!: PostMeta;

  @Column(() => PostAuthor)
  author!: PostAuthor | null;
}

export const MONGO_ENTITIES = [Post];
