import type { FindOperator, ObjectLiteral } from 'typeorm';
import type { ConditionTree } from './condition-tree';
import { UnsupportedConditionError } from './errors';
import { isConditionsList, isFindOperator, isNestedConditions, sqlLikeToRegex } from './find-operator';

export interface MongoQueryOptions {
  /** Entity property that maps to `_id` (TypeORM's `@ObjectIdColumn()`), renamed in the output. */
  objectIdProperty?: string;
}

/**
 * Compiles a condition tree into a MongoDB filter for TypeORM's mongodb driver, which passes
 * `where` straight to the driver. Nested objects become dotted paths (embedded documents) and
 * `cannot` rules become `$nor`, which also matches documents where the field is missing, exactly
 * like `typeormQueryMatcher` does.
 */
export function conditionTreeToMongoQuery(tree: ConditionTree, options: MongoQueryOptions = {}): ObjectLiteral {
  switch (tree.kind) {
    case 'always':
      return {};
    case 'where':
      return whereToMongo(tree.conditions, '', options);
    case 'and':
      return combine(tree.nodes.map((node) => conditionTreeToMongoQuery(node, options)));
    case 'or': {
      const branches = tree.nodes.map((node) => conditionTreeToMongoQuery(node, options));
      return branches.length === 1 ? branches[0]! : { $or: branches };
    }
    case 'not':
      return { $nor: [conditionTreeToMongoQuery(tree.node, options)] };
  }
}

function whereToMongo(
  conditions: ObjectLiteral | ObjectLiteral[],
  prefix: string,
  options: MongoQueryOptions,
): ObjectLiteral {
  if (Array.isArray(conditions)) {
    return { $or: conditions.map((branch: ObjectLiteral) => whereToMongo(branch, prefix, options)) };
  }

  const clauses: ObjectLiteral[] = [];
  for (const [key, value] of Object.entries<unknown>(conditions)) {
    if (value === undefined) continue;
    const property = !prefix && key === options.objectIdProperty ? '_id' : key;
    const path = prefix ? `${prefix}.${property}` : property;

    if (isNestedConditions(value)) clauses.push(whereToMongo(value, path, options));
    else if (isConditionsList(value)) clauses.push(whereToMongo(value, path, options));
    else if (isFindOperator(value)) clauses.push(operatorToMongo(path, value));
    else if (Array.isArray(value)) clauses.push({ [path]: { $in: value } });
    else clauses.push({ [path]: value });
  }
  return combine(clauses);
}

/** Merges clauses into one object when their keys are distinct, otherwise wraps them in `$and`. */
function combine(clauses: ObjectLiteral[]): ObjectLiteral {
  if (clauses.length === 1) return clauses[0]!;
  const keys = clauses.flatMap((clause) => Object.keys(clause));
  if (new Set(keys).size === keys.length) {
    return Object.assign({}, ...clauses) as ObjectLiteral;
  }
  return { $and: clauses };
}

function operatorToMongo(path: string, operator: FindOperator<unknown>): ObjectLiteral {
  const { type, value, child } = operator;

  switch (type) {
    case 'equal':
      return { [path]: value };
    case 'not':
      return child ? { $nor: [operatorToMongo(path, child)] } : { [path]: { $ne: value } };
    case 'lessThan':
      return { [path]: { $lt: value } };
    case 'lessThanOrEqual':
      return { [path]: { $lte: value } };
    case 'moreThan':
      return { [path]: { $gt: value } };
    case 'moreThanOrEqual':
      return { [path]: { $gte: value } };
    case 'in':
    case 'any':
      return { [path]: { $in: value } };
    case 'isNull':
      return { [path]: null };
    case 'like':
      return { [path]: { $regex: sqlLikeToRegex(value as string, false) } };
    case 'ilike':
      return { [path]: { $regex: sqlLikeToRegex(value as string, true) } };
    case 'between': {
      const [lower, upper] = value as [unknown, unknown];
      return { [path]: { $gte: lower, $lte: upper } };
    }
    case 'and':
      return { $and: (value as FindOperator<unknown>[]).map((sub) => operatorToMongo(path, sub)) };
    case 'or':
      return { $or: (value as FindOperator<unknown>[]).map((sub) => operatorToMongo(path, sub)) };
    case 'arrayContains':
      return { [path]: { $all: value } };
    case 'arrayOverlap':
      return { [path]: { $in: value } };
    case 'arrayContainedBy':
      return { [path]: { $not: { $elemMatch: { $nin: value } } } };
    case 'jsonContains':
    case 'raw':
      throw new UnsupportedConditionError(`The ${String(type)} operator cannot be translated to a MongoDB filter.`);
    default:
      throw new UnsupportedConditionError(`Unsupported FindOperator type: "${String(type)}"`);
  }
}
