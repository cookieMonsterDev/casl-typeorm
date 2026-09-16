import {
  Brackets,
  type EntityMetadata,
  NotBrackets,
  type ObjectLiteral,
  type RelationMetadata,
  type SelectQueryBuilder,
  type WhereExpressionBuilder,
} from 'typeorm';
import type { ConditionTree } from './condition-tree';
import { CaslTypeOrmError, UnsupportedConditionError } from './errors';
import { isConditionsList, isFindOperator, isNestedConditions } from './find-operator';

/** The query builder whose alias and entity a `where` fragment refers to. */
interface Scope {
  readonly qb: SelectQueryBuilder<ObjectLiteral>;
  readonly alias: string;
  readonly metadata: EntityMetadata;
}

interface Context {
  readonly root: SelectQueryBuilder<ObjectLiteral>;
  aliasCount: number;
}

/** Wraps raw SQL so every compiled fragment is a `Brackets` and composes uniformly. */
function raw(sql: string): Brackets {
  return new Brackets((where) => where.where(sql));
}

/**
 * Adds the condition tree to the query builder's WHERE clause. Relation conditions become
 * correlated `EXISTS` subqueries, so `cannot` rules on relations negate exactly and to-many
 * relations never duplicate rows. A `null` tree (no access) adds `1 = 0`.
 */
export function applyConditionTree<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  tree: ConditionTree | null,
): SelectQueryBuilder<T> {
  const mainAlias = qb.expressionMap.mainAlias;
  if (!mainAlias?.hasMetadata) {
    throw new CaslTypeOrmError(
      'applyTo() needs a query builder that selects an entity, e.g. repository.createQueryBuilder("alias").',
    );
  }
  if (!tree) return qb.andWhere(raw('1 = 0'));

  const context: Context = { root: qb, aliasCount: 0 };
  const scope: Scope = { qb, alias: mainAlias.name, metadata: mainAlias.metadata };
  return qb.andWhere(compileTree(context, scope, tree));
}

function compileTree(context: Context, scope: Scope, tree: ConditionTree): Brackets {
  switch (tree.kind) {
    case 'always':
      return raw('1 = 1');
    case 'where':
      return new Brackets((where) => compileWhere(context, scope, where, tree.conditions));
    case 'and':
      return new Brackets((where) => {
        for (const node of tree.nodes) where.andWhere(compileTree(context, scope, node));
      });
    case 'or':
      return new Brackets((where) => {
        for (const node of tree.nodes) where.orWhere(compileTree(context, scope, node));
      });
    case 'not':
      return new NotBrackets((where) => where.where(compileTree(context, scope, tree.node)));
  }
}

function compileWhere(
  context: Context,
  scope: Scope,
  where: WhereExpressionBuilder,
  conditions: ObjectLiteral | ObjectLiteral[],
): void {
  if (Array.isArray(conditions)) {
    for (const branch of conditions as ObjectLiteral[]) {
      where.orWhere(new Brackets((inner) => compileWhere(context, scope, inner, branch)));
    }
    return;
  }

  const entries = Object.entries(conditions as Record<string, unknown>).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    where.where('1 = 1');
    return;
  }
  for (const [key, value] of entries) {
    where.andWhere(compileProperty(context, scope, key, value));
  }
}

function compileProperty(context: Context, scope: Scope, key: string, value: unknown): Brackets {
  const { metadata } = scope;
  const relation = metadata.findRelationWithPropertyPath(key);

  if (relation && (isNestedConditions(value) || isConditionsList(value))) {
    return existsCondition(context, scope, relation, value);
  }
  if (relation && isFindOperator(value) && !relation.isOwning) {
    throw new UnsupportedConditionError(
      `A FindOperator on to-many relation "${key}" of "${metadata.name}" is not supported by the query builder backend. ` +
        'Use nested conditions on the relation instead.',
    );
  }
  if (relation || metadata.findColumnWithPropertyPathStrict(key) || metadata.findEmbeddedWithPropertyPath(key)) {
    // Columns, embedded objects and relation ids are handled by TypeORM's own object-literal where.
    return new Brackets((where) => where.where({ [key]: value }));
  }
  throw new CaslTypeOrmError(`Property "${key}" was not found in entity "${metadata.name}".`);
}

function existsCondition(
  context: Context,
  scope: Scope,
  relation: RelationMetadata,
  conditions: ObjectLiteral | ObjectLiteral[],
): Brackets {
  const target = relation.inverseEntityMetadata;
  const alias = nextAlias(context, relation.propertyName);
  const subQuery = scope.qb.subQuery().select('1').from(target.target, alias);
  const escape = (name: string): string => context.root.escape(name);
  const column = (tableAlias: string, name: string): string => `${escape(tableAlias)}.${escape(name)}`;

  if (relation.isManyToMany) {
    const owner = relation.isOwning ? relation : relation.inverseRelation!;
    const junction = owner.junctionEntityMetadata!;
    const junctionAlias = nextAlias(context, `${relation.propertyName}_junction`);
    // Owning side: joinColumns point at the parent entity, inverseJoinColumns at the target.
    const parentColumns = relation.isOwning ? owner.joinColumns : owner.inverseJoinColumns;
    const targetColumns = relation.isOwning ? owner.inverseJoinColumns : owner.joinColumns;
    const joinOn = targetColumns
      .map((jc) => `${column(junctionAlias, jc.databaseName)} = ${column(alias, jc.referencedColumn!.databaseName)}`)
      .join(' AND ');
    const correlation = parentColumns
      .map(
        (jc) => `${column(junctionAlias, jc.databaseName)} = ${column(scope.alias, jc.referencedColumn!.databaseName)}`,
      )
      .join(' AND ');
    subQuery.innerJoin(junction.tableName, junctionAlias, joinOn).where(correlation);
  } else if (relation.isOwning) {
    // Many-to-one / owning one-to-one: the foreign key lives on the parent.
    const correlation = relation.joinColumns
      .map((jc) => `${column(alias, jc.referencedColumn!.databaseName)} = ${column(scope.alias, jc.databaseName)}`)
      .join(' AND ');
    subQuery.where(correlation);
  } else {
    // One-to-many / inverse one-to-one: the foreign key lives on the related entity.
    const correlation = relation
      .inverseRelation!.joinColumns.map(
        (jc) => `${column(alias, jc.databaseName)} = ${column(scope.alias, jc.referencedColumn!.databaseName)}`,
      )
      .join(' AND ');
    subQuery.where(correlation);
  }

  const inner: Scope = { qb: subQuery, alias, metadata: target };
  subQuery.andWhere(new Brackets((where) => compileWhere(context, inner, where, conditions)));
  return raw(`EXISTS ${subQuery.getQuery()}`);
}

function nextAlias(context: Context, name: string): string {
  context.aliasCount += 1;
  return `casl_${name}_${context.aliasCount}`;
}
