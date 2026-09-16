import type { AnyAbility, SubjectType } from '@casl/ability';
import type { FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { type ConditionTree, rulesToConditionTree } from './condition-tree';
import { conditionTreeToFindOptions } from './find-options';

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
}

export function accessibleBy(ability: AnyAbility, action = 'read'): AccessibleRecords {
  return new AccessibleRecords(ability, action);
}
