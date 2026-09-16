import type { AnyAbility } from '@casl/ability';
import {
  type FindManyOptions,
  type FindOptionsWhere,
  InstanceChecker,
  type ObjectLiteral,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { accessibleBy } from './accessible-by';
import { CaslTypeOrmError } from './errors';

/** `find()` options whose `where` may also be a raw MongoDB filter, as TypeORM's mongodb driver allows. */
export type FindAccessibleOptions<E extends ObjectLiteral> = Omit<FindManyOptions<E>, 'where'> & {
  where?: FindOptionsWhere<E> | FindOptionsWhere<E>[] | ObjectLiteral;
};

/**
 * Methods added to a repository by `repository.extend(accessibleRecords)`.
 *
 * ```ts
 * const articles = dataSource.getRepository(Article).extend(accessibleRecords);
 * const rows = await articles.accessibleBy(ability, 'read').orderBy('Article.id').getMany();
 * ```
 */
export interface AccessibleRecordsExtension {
  /** Query builder restricted to the records `ability` grants `action` on. SQL databases only. */
  accessibleBy<E extends ObjectLiteral>(
    this: Repository<E>,
    ability: AnyAbility,
    action?: string,
    alias?: string,
  ): SelectQueryBuilder<E>;

  /**
   * `find()` restricted to accessible records. `options.where`, `relations`, `order`, `take` and
   * `skip` are honoured. Works with SQL databases and with TypeORM's MongoDB driver.
   */
  findAccessible<E extends ObjectLiteral>(
    this: Repository<E>,
    ability: AnyAbility,
    action?: string,
    options?: FindAccessibleOptions<E>,
  ): Promise<E[]>;
}

export const accessibleRecords: AccessibleRecordsExtension = {
  accessibleBy(ability, action = 'read', alias) {
    if (InstanceChecker.isMongoEntityManager(this.manager)) {
      throw new CaslTypeOrmError(
        'Query builders are not available for MongoDB. Use findAccessible() or accessibleBy(...).toMongoQuery().',
      );
    }
    return accessibleBy(ability, action).applyTo(this.createQueryBuilder(alias ?? this.metadata.targetName));
  },

  async findAccessible<E extends ObjectLiteral>(
    this: Repository<E>,
    ability: AnyAbility,
    action = 'read',
    options: FindAccessibleOptions<E> = {},
  ) {
    const records = accessibleBy(ability, action);

    if (InstanceChecker.isMongoEntityManager(this.manager)) {
      const filter = records.toMongoQuery(records.subjectTypeFor(this.metadata), this.metadata);
      if (filter === null) return [];
      // TypeORM's mongodb driver passes `where` through as a raw filter, so `$and` is the merge.
      const where = (options.where ? { $and: [options.where, filter] } : filter) as FindOptionsWhere<E>;
      return this.find({ ...options, where });
    }

    const qb = this.createQueryBuilder(this.metadata.targetName).setFindOptions(options as FindManyOptions<E>);
    return records.applyTo(qb).getMany();
  },
};
