import { type FindOptionsWhere } from 'typeorm';

function isFindOperator(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)['@instanceof'] === Symbol.for('FindOperator')
  );
}

function sqlLikeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
  let regexStr = '';
  for (const char of pattern) {
    if (char === '%') {
      regexStr += '.*';
      continue;
    }
    if (char === '_') {
      regexStr += '.';
      continue;
    }
    regexStr += char.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }
  return new RegExp(`^${regexStr}$`, caseInsensitive ? 'i' : '');
}

function evaluateFindOperator(fieldValue: unknown, op: Record<string, unknown>): boolean {
  const type = op['type'] as string;
  const child = op['child'] as Record<string, unknown> | undefined;
  const value = op['value'] as unknown;

  switch (type) {
    case 'equal':
      return fieldValue === value;

    case 'not':
      if (child) return !evaluateFindOperator(fieldValue, child);
      return fieldValue !== value;

    case 'lessThan':
      return (fieldValue as number) < (value as number);

    case 'lessThanOrEqual':
      return (fieldValue as number) <= (value as number);

    case 'moreThan':
      return (fieldValue as number) > (value as number);

    case 'moreThanOrEqual':
      return (fieldValue as number) >= (value as number);

    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);

    case 'isNull':
      return fieldValue === null || fieldValue === undefined;

    case 'like':
      return (
        typeof fieldValue === 'string' && sqlLikeToRegex(value as string, false).test(fieldValue)
      );

    case 'ilike':
      return (
        typeof fieldValue === 'string' && sqlLikeToRegex(value as string, true).test(fieldValue)
      );

    case 'between': {
      const [lower, upper] = value as [unknown, unknown];
      return (
        (fieldValue as number) >= (lower as number) && (fieldValue as number) <= (upper as number)
      );
    }

    case 'and': {
      const subOps = value as Array<Record<string, unknown>>;
      return subOps.every((sub) => evaluateFindOperator(fieldValue, sub));
    }

    case 'or': {
      const subOps = value as Array<Record<string, unknown>>;
      return subOps.some((sub) => evaluateFindOperator(fieldValue, sub));
    }

    case 'arrayContains':
      return (
        Array.isArray(fieldValue) &&
        (value as unknown[]).every((v) => (fieldValue as unknown[]).includes(v))
      );

    case 'arrayContainedBy':
      return (
        Array.isArray(fieldValue) &&
        (fieldValue as unknown[]).every((v) => (value as unknown[]).includes(v))
      );

    case 'arrayOverlap':
      return (
        Array.isArray(fieldValue) &&
        (value as unknown[]).some((v) => (fieldValue as unknown[]).includes(v))
      );

    case 'raw':
      throw new Error(
        'Raw operator is not supported for runtime ability checks. ' +
          'It can only be used for database query generation.',
      );

    default:
      throw new Error(`Unsupported FindOperator type: "${type}"`);
  }
}

function evaluateConditions(
  object: Record<string, unknown>,
  conditions: FindOptionsWhere<unknown>,
): boolean {
  for (const [key, condition] of Object.entries(conditions)) {
    const fieldValue = object[key];

    if (isFindOperator(condition)) {
      if (!evaluateFindOperator(fieldValue, condition as Record<string, unknown>)) {
        return false;
      }
      continue;
    }
    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition)) {
      if (fieldValue === null || fieldValue === undefined) {
        return false;
      }
      if (
        !evaluateConditions(
          fieldValue as Record<string, unknown>,
          condition as FindOptionsWhere<unknown>,
        )
      ) {
        return false;
      }
      continue;
    }
    if (fieldValue !== condition) return false;
  }
  return true;
}

export function typeormQueryMatcher(
  conditions: FindOptionsWhere<unknown>,
): (object: unknown) => boolean {
  return (object: unknown) => evaluateConditions(object as Record<string, unknown>, conditions);
}
