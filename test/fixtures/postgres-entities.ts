import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** PostgreSQL-only column types: registered by createSqlDataSource() when DB=postgres. */
@Entity()
export class Tagged {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'text', array: true })
  tags!: string[];

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}

export const POSTGRES_ENTITIES = [Tagged];
