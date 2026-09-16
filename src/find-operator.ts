import { type FindOperator, In, InstanceChecker, IsNull, type ObjectLiteral } from 'typeorm';

export function isFindOperator(value: unknown): value is FindOperator<unknown> {
  return InstanceChecker.isFindOperator(value);
}

function isPlainObject(value: unknown): value is ObjectLiteral {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Nested `FindOptionsWhere` for a relation or an embedded column, e.g. `{ author: { id: 1 } }`. */
export function isNestedConditions(value: unknown): value is ObjectLiteral {
  return isPlainObject(value) && !isFindOperator(value);
}

/** TypeORM's OR form for a relation: `{ author: [{ id: 1 }, { role: 'admin' }] }`. */
export function isConditionsList(value: unknown): value is ObjectLiteral[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNestedConditions);
}

/** A condition value that addresses a relation or embedded object rather than a column value. */
export function isRelationLike(value: unknown): value is ObjectLiteral | ObjectLiteral[] {
  return isNestedConditions(value) || isConditionsList(value);
}

/**
 * Gives `null` and plain arrays the meaning `typeormQueryMatcher` applies to them (`IS NULL`, `IN`)
 * before TypeORM sees them; TypeORM itself would compile both to `=`, which never matches.
 */
export function normalizeValue(value: unknown): unknown {
  if (value === null) return IsNull();
  if (Array.isArray(value) && !isConditionsList(value)) return In(value);
  return value;
}

/**
 * Equality with the semantics a database applies to bound parameters: `Date`, `Buffer`, `ObjectId`
 * and similar value objects compare by value, everything else by identity.
 */
export function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (hasEquals(left)) return left.equals(right);
  if (hasEquals(right)) return right.equals(left);
  return false;
}

function hasEquals(value: unknown): value is { equals(other: unknown): boolean } {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { equals?: unknown }).equals === 'function' &&
    !(value instanceof Date)
  );
}

/** Translates an SQL `LIKE` pattern (`%`, `_`) into an anchored regular expression. */
export function sqlLikeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '%') source += '.*';
    else if (char === '_') source += '.';
    else source += char.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, caseInsensitive ? 'is' : 's');
}
