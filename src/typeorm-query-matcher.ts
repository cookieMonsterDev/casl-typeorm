import type { FindOperator, FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { RelationNotLoadedError, UnsupportedConditionError } from './errors';
import { isFindOperator, isNestedConditions, isRelationLike, sqlLikeToRegex, valuesEqual } from './find-operator';

type Comparable = number | bigint | string | Date;

function isComparable(value: unknown): value is Comparable {
  return typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string' || value instanceof Date;
}

function compare(left: unknown, right: unknown, test: (delta: number) => boolean): boolean {
  if (!isComparable(left) || !isComparable(right)) return false;
  if (left < right) return test(-1);
  if (left > right) return test(1);
  return test(0);
}

function includes(list: unknown, value: unknown): boolean {
  return Array.isArray(list) && list.some((item) => valuesEqual(item, value));
}

/** PostgreSQL `@>` semantics: every key/element of `needle` is contained in `haystack`. */
function jsonContains(haystack: unknown, needle: unknown): boolean {
  if (Array.isArray(needle)) {
    return (
      Array.isArray(haystack) && needle.every((item) => haystack.some((candidate) => jsonContains(candidate, item)))
    );
  }
  if (isNestedConditions(needle)) {
    return (
      isNestedConditions(haystack) && Object.entries(needle).every(([key, value]) => jsonContains(haystack[key], value))
    );
  }
  return valuesEqual(haystack, needle);
}

function evaluateFindOperator(fieldValue: unknown, operator: FindOperator<unknown>): boolean {
  const { type, value, child } = operator;

  switch (type) {
    case 'equal':
      return valuesEqual(fieldValue, value);
    case 'not':
      return child ? !evaluateFindOperator(fieldValue, child) : !valuesEqual(fieldValue, value);
    case 'lessThan':
      return compare(fieldValue, value, (delta) => delta < 0);
    case 'lessThanOrEqual':
      return compare(fieldValue, value, (delta) => delta <= 0);
    case 'moreThan':
      return compare(fieldValue, value, (delta) => delta > 0);
    case 'moreThanOrEqual':
      return compare(fieldValue, value, (delta) => delta >= 0);
    case 'in':
    case 'any':
      return includes(value, fieldValue);
    case 'isNull':
      return fieldValue === null || fieldValue === undefined;
    case 'like':
      return typeof fieldValue === 'string' && sqlLikeToRegex(value as string, false).test(fieldValue);
    case 'ilike':
      return typeof fieldValue === 'string' && sqlLikeToRegex(value as string, true).test(fieldValue);
    case 'between': {
      const [lower, upper] = value as [unknown, unknown];
      return compare(fieldValue, lower, (delta) => delta >= 0) && compare(fieldValue, upper, (delta) => delta <= 0);
    }
    case 'and':
      return (value as FindOperator<unknown>[]).every((sub) => evaluateFindOperator(fieldValue, sub));
    case 'or':
      return (value as FindOperator<unknown>[]).some((sub) => evaluateFindOperator(fieldValue, sub));
    case 'arrayContains':
      return Array.isArray(fieldValue) && (value as unknown[]).every((item) => includes(fieldValue, item));
    case 'arrayContainedBy':
      return Array.isArray(fieldValue) && fieldValue.every((item) => includes(value, item));
    case 'arrayOverlap':
      return Array.isArray(fieldValue) && (value as unknown[]).some((item) => includes(fieldValue, item));
    case 'jsonContains':
      return jsonContains(fieldValue, value);
    case 'raw':
      throw new UnsupportedConditionError(
        'Raw operator is not supported for runtime ability checks. It can only be used for database query generation.',
      );
    default:
      throw new UnsupportedConditionError(`Unsupported FindOperator type: "${String(type)}"`);
  }
}

export interface TypeOrmMatcherOptions {
  /**
   * What `ability.can()` does when a condition targets a nested property that is `undefined` on the
   * entity. `'throw'` (default) treats it as a relation that was not loaded and throws, which
   * catches a missing `relations: { ... }` early. `'deny'` treats it like `null` (no match), which
   * suits optional embedded documents, e.g. with TypeORM's mongodb driver.
   */
  unloadedRelation?: 'throw' | 'deny';
}

function evaluateRelation(
  key: string,
  fieldValue: unknown,
  conditions: ObjectLiteral | ObjectLiteral[],
  options: TypeOrmMatcherOptions,
): boolean {
  if (fieldValue === undefined && options.unloadedRelation !== 'deny') {
    throw new RelationNotLoadedError(key);
  }
  if (fieldValue === null || fieldValue === undefined) return false;
  // A to-many relation matches when at least one related record matches (EXISTS semantics).
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((item: unknown) => evaluateWhere(item as ObjectLiteral, conditions, options));
  }
  return evaluateWhere(fieldValue, conditions, options);
}

function evaluateWhere(
  object: ObjectLiteral,
  conditions: ObjectLiteral | ObjectLiteral[],
  options: TypeOrmMatcherOptions,
): boolean {
  if (Array.isArray(conditions)) {
    return conditions.some((branch: ObjectLiteral) => evaluateWhere(object, branch, options));
  }

  for (const [key, condition] of Object.entries<unknown>(conditions)) {
    if (condition === undefined) continue;
    const fieldValue: unknown = object[key];

    if (isFindOperator(condition)) {
      if (!evaluateFindOperator(fieldValue, condition)) return false;
    } else if (isRelationLike(condition)) {
      if (!evaluateRelation(key, fieldValue, condition, options)) return false;
    } else if (Array.isArray(condition)) {
      if (!includes(condition, fieldValue)) return false;
    } else if (condition === null) {
      // `null` means IS NULL, as in the SQL backends; a missing property counts as null.
      if (fieldValue !== null && fieldValue !== undefined) return false;
    } else if (!valuesEqual(fieldValue, condition)) {
      return false;
    }
  }
  return true;
}

export type TypeOrmQueryMatcher = <T extends ObjectLiteral>(
  conditions: FindOptionsWhere<T> | FindOptionsWhere<T>[],
) => (object: T) => boolean;

/** Builds a CASL conditions matcher for TypeORM `FindOptionsWhere` conditions. */
export function createTypeormQueryMatcher(options: TypeOrmMatcherOptions = {}): TypeOrmQueryMatcher {
  return (conditions) => (object) => evaluateWhere(object, conditions, options);
}

/**
 * CASL conditions matcher for TypeORM `FindOptionsWhere` conditions, used by `ability.can()` on
 * entity instances. Relations referenced by a condition must be loaded on the entity.
 */
export const typeormQueryMatcher: TypeOrmQueryMatcher = createTypeormQueryMatcher();
