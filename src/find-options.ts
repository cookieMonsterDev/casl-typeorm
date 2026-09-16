import { And, Equal, type FindOperator, In, Not, type ObjectLiteral } from 'typeorm';
import type { ConditionTree } from './condition-tree';
import { UnsupportedConditionError } from './errors';
import { isConditionsList, isFindOperator, isNestedConditions } from './find-operator';

/**
 * Compiles a condition tree into TypeORM's `FindOptionsWhere[]` (an OR of AND-merged objects).
 *
 * `FindOptionsWhere` cannot negate a nested relation condition, so a `cannot` rule on a relation
 * throws `UnsupportedConditionError`; the query builder backend handles that case.
 */
export function conditionTreeToFindOptions(tree: ConditionTree): ObjectLiteral[] {
  switch (tree.kind) {
    case 'always':
      return [{}];
    case 'where':
      return [tree.conditions];
    case 'or':
      return tree.nodes.flatMap(conditionTreeToFindOptions);
    case 'and':
      return tree.nodes.map(conditionTreeToFindOptions).reduce(crossMerge, [{}]);
    case 'not':
      return negate(tree.node);
  }
}

function negate(tree: ConditionTree): ObjectLiteral[] {
  switch (tree.kind) {
    case 'always':
      return [];
    case 'not':
      return conditionTreeToFindOptions(tree.node);
    // De Morgan: NOT (a OR b) = NOT a AND NOT b
    case 'or':
      return tree.nodes.map(negate).reduce(crossMerge, [{}]);
    // De Morgan: NOT (a AND b) = NOT a OR NOT b
    case 'and':
      return tree.nodes.flatMap(negate);
    case 'where':
      return negateWhere(tree.conditions);
  }
}

/** `NOT (f1 = a AND f2 = b)` becomes one OR branch per field: `[{ f1: Not(a) }, { f2: Not(b) }]`. */
function negateWhere(conditions: ObjectLiteral): ObjectLiteral[] {
  const branches: ObjectLiteral[] = [];
  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined) continue;
    if (isNestedConditions(value) || isConditionsList(value)) {
      throw new UnsupportedConditionError(
        `FindOptionsWhere cannot express a "cannot" rule on relation "${key}". ` +
          'Use accessibleBy(ability, action).applyTo(queryBuilder) or the accessibleRecords repository extension instead.',
      );
    }
    branches.push({ [key]: Not(Array.isArray(value) ? In(value) : value) });
  }
  return branches;
}

function crossMerge(left: ObjectLiteral[], right: ObjectLiteral[]): ObjectLiteral[] {
  return left.flatMap((a) => right.map((b) => mergeWhere(a, b)));
}

function mergeWhere(left: ObjectLiteral, right: ObjectLiteral): ObjectLiteral {
  const merged: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = key in merged ? mergeValues(key, merged[key], value) : value;
  }
  return merged;
}

/** Two constraints on the same property must both hold; TypeORM's `And()` expresses that. */
function mergeValues(key: string, left: unknown, right: unknown): unknown {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (isNestedConditions(left) && isNestedConditions(right)) return mergeWhere(left, right);
  if (isRelationLike(left) || isRelationLike(right)) {
    throw new UnsupportedConditionError(
      `FindOptionsWhere cannot combine the conditions on relation "${key}". ` +
        'Use accessibleBy(ability, action).applyTo(queryBuilder) instead.',
    );
  }
  return And(...flattenAnd(toOperator(left)), ...flattenAnd(toOperator(right)));
}

function isRelationLike(value: unknown): boolean {
  return isNestedConditions(value) || isConditionsList(value);
}

function toOperator(value: unknown): FindOperator<unknown> {
  if (isFindOperator(value)) return value;
  if (Array.isArray(value)) return In(value);
  return Equal(value);
}

function flattenAnd(operator: FindOperator<unknown>): FindOperator<unknown>[] {
  return operator.type === 'and' ? (operator.value as FindOperator<unknown>[]) : [operator];
}
