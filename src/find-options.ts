import { And, Equal, type FindOperator, Not, type ObjectLiteral } from 'typeorm';
import type { ConditionTree } from './condition-tree';
import { UnsupportedConditionError } from './errors';
import { isFindOperator, isNestedConditions, isRelationLike, normalizeValue } from './find-operator';

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
      return [normalizeWhere(tree.conditions)];
    case 'or':
      return tree.nodes.flatMap(conditionTreeToFindOptions);
    case 'and':
      return tree.nodes.map(conditionTreeToFindOptions).reduce(distributeAnd, [{}]);
    case 'not':
      return negate(tree.node);
  }
}

/** Replaces `null` with `IsNull()` and scalar arrays with `In()`, recursing into relation objects. */
function normalizeWhere(conditions: ObjectLiteral): ObjectLiteral {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries<unknown>(conditions)) {
    if (value === undefined) continue;
    if (isNestedConditions(value)) normalized[key] = normalizeWhere(value);
    else if (Array.isArray(value) && isRelationLike(value)) normalized[key] = value.map(normalizeWhere);
    else normalized[key] = normalizeValue(value);
  }
  return normalized;
}

function negate(tree: ConditionTree): ObjectLiteral[] {
  switch (tree.kind) {
    case 'always':
      return [];
    case 'not':
      return conditionTreeToFindOptions(tree.node);
    // De Morgan: NOT (a OR b) = NOT a AND NOT b
    case 'or':
      return tree.nodes.map(negate).reduce(distributeAnd, [{}]);
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
    if (isRelationLike(value)) {
      throw new UnsupportedConditionError(
        `FindOptionsWhere cannot express a "cannot" rule on relation "${key}". ` +
          'Use accessibleBy(ability, action).applyTo(queryBuilder) or the accessibleRecords repository extension instead.',
      );
    }
    branches.push({ [key]: Not(normalizeValue(value)) });
  }
  return branches;
}

/** `(a OR b) AND (c OR d)` as an OR of merged objects: `[ac, ad, bc, bd]`. */
function distributeAnd(left: ObjectLiteral[], right: ObjectLiteral[]): ObjectLiteral[] {
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

function toOperator(value: unknown): FindOperator<unknown> {
  const normalized = normalizeValue(value);
  return isFindOperator(normalized) ? normalized : Equal(normalized);
}

function flattenAnd(operator: FindOperator<unknown>): FindOperator<unknown>[] {
  return operator.type === 'and' ? (operator.value as FindOperator<unknown>[]) : [operator];
}
