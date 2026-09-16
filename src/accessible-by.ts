import type { AnyAbility, SubjectType } from '@casl/ability';
import type { EntityMetadata, FindOptionsWhere, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { type ConditionTree, rulesToConditionTree } from './condition-tree';
import { CaslTypeOrmError } from './errors';
import { conditionTreeToFindOptions } from './find-options';
import { applyConditionTree } from './query-builder';

export interface ApplyToOptions {
  /**
   * Subject type the rules were defined for. By default the entity class is used when the ability
   * has rules for it, otherwise the entity name (`metadata.name`).
   */
  subjectType?: SubjectType;
}

export class AccessibleRecords {
  readonly ability: AnyAbility;
  readonly action: string;

  constructor(ability: AnyAbility, action: string) {
    this.ability = ability;
    this.action = action;
  }

  /** Condition tree for `subjectType`, or `null` when the ability grants no access. */
  conditionTreeFor(subjectType: SubjectType): ConditionTree | null {
    return rulesToConditionTree(this.ability.rulesFor(this.action, subjectType));
  }

  /**
   * `FindOptionsWhere[]` for `find()`, `findOne()`, `count()` and friends, or `null` when the
   * ability grants no access at all. Throws `UnsupportedConditionError` when a `cannot` rule
   * targets a relation, which `FindOptionsWhere` cannot negate; use `applyTo()` for that.
   */
  ofType<T extends ObjectLiteral>(subjectType: SubjectType): FindOptionsWhere<T>[] | null {
    const tree = this.conditionTreeFor(subjectType);
    return tree ? (conditionTreeToFindOptions(tree) as FindOptionsWhere<T>[]) : null;
  }

  /**
   * Restricts a `SelectQueryBuilder` to accessible records and returns it. Relation conditions
   * compile to correlated `EXISTS` subqueries, so `cannot` rules on relations and to-many relations
   * are exact. When the ability grants no access the query returns no rows.
   */
  applyTo<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, options: ApplyToOptions = {}): SelectQueryBuilder<T> {
    const metadata = qb.expressionMap.mainAlias?.metadata;
    if (!metadata) {
      throw new CaslTypeOrmError(
        'applyTo() needs a query builder that selects an entity, e.g. repository.createQueryBuilder("alias").',
      );
    }
    const subjectType = options.subjectType ?? this.subjectTypeFor(metadata);
    return applyConditionTree(qb, this.conditionTreeFor(subjectType));
  }

  /** Picks the subject type the ability actually has rules for: the entity class or its name. */
  subjectTypeFor(metadata: EntityMetadata): SubjectType {
    const candidates: SubjectType[] =
      typeof metadata.target === 'function' ? [metadata.target as SubjectType, metadata.name] : [metadata.name];
    return (
      candidates.find((candidate) => this.ability.possibleRulesFor(this.action, candidate).length > 0) ?? candidates[0]!
    );
  }
}

export function accessibleBy(ability: AnyAbility, action = 'read'): AccessibleRecords {
  return new AccessibleRecords(ability, action);
}
