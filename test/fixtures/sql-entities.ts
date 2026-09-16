import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Role = 'admin' | 'editor' | 'viewer';
export type ArticleStatus = 'draft' | 'published' | 'archived' | 'banned';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: Role;

  @Column({ type: 'boolean' })
  isVerified!: boolean;

  @Column({ type: 'boolean' })
  banned!: boolean;

  @OneToOne(() => Profile, (profile) => profile.user)
  profile!: Profile | null;

  @OneToMany(() => Article, (article) => article.author)
  articles!: Article[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments!: Comment[];
}

@Entity()
export class Profile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 2 })
  country!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bio!: string | null;

  @OneToOne(() => User, (user) => user.profile)
  @JoinColumn()
  user!: User;
}

export class ArticleMeta {
  @Column({ type: 'varchar', length: 8 })
  locale!: string;

  @Column({ type: 'int' })
  revision!: number;
}

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'boolean' })
  restricted!: boolean;

  @ManyToMany(() => Article, (article) => article.categories)
  articles!: Article[];
}

@Entity()
export class Article {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 128 })
  title!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: ArticleStatus;

  @Column({ type: 'int' })
  views!: number;

  @Column({ type: 'boolean' })
  published!: boolean;

  @Column({ type: 'boolean' })
  secret!: boolean;

  @Column({ type: 'boolean' })
  internal!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deletedReason!: string | null;

  @Column({ type: Date })
  createdAt!: Date;

  @Column(() => ArticleMeta)
  meta!: ArticleMeta;

  @ManyToOne(() => User, (user) => user.articles, { nullable: true })
  author!: User | null;

  @Column({ type: 'int', nullable: true })
  authorId!: number | null;

  @OneToMany(() => Comment, (comment) => comment.article)
  comments!: Comment[];

  @ManyToMany(() => Category, (category) => category.articles)
  @JoinTable()
  categories!: Category[];
}

@Entity()
export class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  body!: string;

  @Column({ type: 'boolean' })
  approved!: boolean;

  @ManyToOne(() => Article, (article) => article.comments, { onDelete: 'CASCADE' })
  article!: Article;

  @ManyToOne(() => User, (user) => user.comments)
  author!: User;

  @Column({ type: 'int' })
  authorId!: number;
}

export const SQL_ENTITIES = [User, Profile, Category, Article, Comment];
