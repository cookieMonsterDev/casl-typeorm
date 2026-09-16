# @cookiemonsterdev/casl-typeorm

TypeORM integration for [CASL](https://casl.js.org): write permission rules with TypeORM's own `FindOptionsWhere`
conditions and use them to filter `find()` queries, query builders and MongoDB filters, and to check single entity
instances with `ability.can()`. Rules can reference related records (`{ author: { banned: true } }`), including in
`cannot` rules, and compile to exact SQL.

```ts
import { AbilityBuilder } from '@casl/ability';
import { In } from 'typeorm';
import { accessibleBy, accessibleRecords, createTypeOrmAbility } from '@cookiemonsterdev/casl-typeorm';

const { can, cannot, build } = new AbilityBuilder(createTypeOrmAbility);
can('read', 'Article', { published: true });
can('read', 'Article', { author: { id: user.id } });
cannot('read', 'Article', { author: { banned: true } });
cannot('read', 'Article', { status: In(['deleted', 'banned']) });
const ability = build();

// Query builder: relations compile to correlated EXISTS subqueries
const articles = await accessibleBy(ability, 'read')
  .applyTo(dataSource.getRepository(Article).createQueryBuilder('article'))
  .leftJoinAndSelect('article.author', 'author')
  .getMany();

// Or extend the repository
const repository = dataSource.getRepository(Article).extend(accessibleRecords);
const page = await repository.findAccessible(ability, 'read', { order: { id: 'DESC' }, take: 20 });

// Instance check
ability.can('read', subject('Article', article));
```

## Installation

```sh
pnpm add @cookiemonsterdev/casl-typeorm @casl/ability typeorm
```

Requires `@casl/ability` 7, `typeorm` 1 and Node `^20.19 || ^22.13 || >=24.11` (TypeORM's supported range). The package
is published as ESM; CommonJS projects on those Node versions can `require()` it.

## Contents

- [Defining an ability](#defining-an-ability)
- [Filtering queries](#filtering-queries)
  - [Query builder](#query-builder-applyto)
  - [Repository extension](#repository-extension-accessiblerecords)
  - [find() options](#find-options-oftype)
  - [MongoDB](#mongodb-tomongoquery)
- [Instance checks](#instance-checks)
- [How rules are compiled](#how-rules-are-compiled)
- [Supported operators](#supported-operators)
- [Semantics and caveats](#semantics-and-caveats)
- [API](#api)
- [Migrating from v1](#migrating-from-v1)

## Defining an ability

`createTypeOrmAbility` creates a CASL ability whose rule conditions are `FindOptionsWhere` objects: the same operators
and nested relation objects you already pass to `repository.find({ where })`.

```ts
import { createTypeOrmAbility, type TypeOrmAbility } from '@cookiemonsterdev/casl-typeorm';
import { MoreThan, Not } from 'typeorm';

type Actions = 'create' | 'read' | 'update' | 'delete' | 'manage';
type Subjects = 'Article' | 'Comment' | 'all';

export function defineAbilityFor(user: User): TypeOrmAbility<[Actions, Subjects]> {
  return createTypeOrmAbility<[Actions, Subjects]>([
    { action: 'read', subject: 'Article', conditions: { published: true } },
    { action: 'read', subject: 'Article', conditions: { author: { id: user.id } } },
    { action: 'update', subject: 'Comment', conditions: { authorId: user.id, article: { locked: false } } },
    // Rules are evaluated last-to-first: this cannot overrides both can rules above.
    { action: 'read', subject: 'Article', conditions: { author: { banned: true } }, inverted: true },
  ]);
}
```

Subjects can be strings (`'Article'`) or entity classes (`Article`). `AbilityBuilder` works as usual:
`new AbilityBuilder(createTypeOrmAbility)`.

Options accepted by `createTypeOrmAbility(rules, options)` are CASL's `Ability` options (`detectSubjectType`,
`anyAction`, `resolveAction`, …) plus [`unloadedRelation`](#instance-checks).

## Filtering queries

All query helpers start from `accessibleBy(ability, action = 'read')`.

### Query builder: `applyTo()`

Adds the ability's conditions to a `SelectQueryBuilder` and returns it. This is the most capable backend: `cannot` rules
on relations, to-many relations and multi-field negations are all exact.

```ts
const qb = dataSource.getRepository(Article).createQueryBuilder('article').where('article.views > :min', { min: 10 });
accessibleBy(ability, 'read').applyTo(qb);

const [rows, total] = await qb.orderBy('article.id').take(20).skip(40).getManyAndCount();
```

- Relation conditions compile to correlated `EXISTS (SELECT 1 FROM …)` subqueries, so to-many conditions never
  duplicate rows and work with `take`/`skip`, and `cannot` rules become `NOT (EXISTS …)`. Many-to-one, one-to-one,
  one-to-many and many-to-many (through the junction table) relations are supported, nested to any depth.
- Columns, embedded objects and relation ids (`{ author: { id: 1 } }`) are delegated to TypeORM's own object-literal
  `where`, so every `FindOperator` TypeORM supports there works.
- When the ability grants no access the query gets `WHERE 1 = 0` and returns no rows.
- The subject type is the entity class when the ability has rules for it, otherwise the entity name. Override it with
  `applyTo(qb, { subjectType: 'Post' })`.

### Repository extension: `accessibleRecords`

TypeORM's `Repository.extend()` adds two methods:

```ts
const articles = dataSource.getRepository(Article).extend(accessibleRecords);

// SelectQueryBuilder<Article>, alias defaults to the entity name ("Article")
await articles.accessibleBy(ability, 'read', 'article').orderBy('article.id').getMany();

// find() restricted to accessible records; relations, order, take/skip and where are honoured
await articles.findAccessible(ability, 'read', {
  where: { status: 'published' },
  relations: { author: true },
  order: { createdAt: 'DESC' },
  take: 20,
});
```

`findAccessible()` also works on a `MongoRepository`, where it merges the caller's filter with the ability's using `$and`.

### `find()` options: `ofType()`

Returns `FindOptionsWhere<T>[]` (TypeORM treats the array as OR) for `find`, `findOne`, `count`, `exists` and friends,
or `null` when the ability grants no access.

```ts
const where = accessibleBy(ability, 'read').ofType(Article);
if (where === null) return [];
const articles = await articleRepository.find({ where, relations: { author: true } });
```

`FindOptionsWhere` cannot express everything a rule set can:

- A `cannot` rule on a relation (`cannot('read', 'Article', { author: { banned: true } })`) has no `FindOptionsWhere`
  form. `ofType()` throws `UnsupportedConditionError`; use `applyTo()` or `findAccessible()` instead.
- Nested relation conditions in `can` rules make TypeORM join the relation; for one-to-many relations TypeORM
  de-duplicates entities, but `take`/`skip` then run on a distinct-id subquery. Prefer `applyTo()` for paginated
  queries over to-many relations.

### MongoDB: `toMongoQuery()`

TypeORM's `mongodb` driver passes `where` straight to the driver, so rules are compiled into a native filter. Nested
objects target embedded documents (`{ author: { banned: true } }` becomes `'author.banned'`), `cannot` rules become
`$nor`, and the entity's `@ObjectIdColumn()` property is renamed to `_id` when the metadata is passed.

```ts
const posts = dataSource.getMongoRepository(Post);
const where = accessibleBy(ability, 'read').toMongoQuery(Post, posts.metadata);
if (where === null) return [];
const rows = await posts.find({ where, take: 20 });

// or
const rows = await posts.extend(accessibleRecords).findAccessible(ability, 'read', { take: 20 });
```

Instance checks against documents whose embedded objects may be missing should use
`createTypeOrmAbility(rules, { unloadedRelation: 'deny' })`.

## Instance checks

`createTypeOrmAbility` wires a conditions matcher that evaluates `FindOptionsWhere` conditions against plain objects, so
`ability.can()` works on loaded entities:

```ts
const article = await articleRepository.findOne({ where: { id }, relations: { author: true, comments: true } });
ability.can('read', subject('Article', article));
```

- Nested conditions require the relation to be loaded. If the property is `undefined`, the check throws
  `Relation "author" is not loaded. Load the relation before checking ability.can().` Pass
  `{ unloadedRelation: 'deny' }` to treat missing values as `null` (no match) instead, e.g. for optional embedded
  documents.
- A `null` relation never matches a nested condition.
- To-many relations match when at least one related record matches, mirroring `EXISTS`.
- `Date`, `Buffer` and `ObjectId` values compare by value; ordered comparisons (`MoreThan`, `Between`, …) against `null`
  never match, like SQL.
- `Raw` cannot be evaluated at runtime and throws `UnsupportedConditionError`.

The matcher is exported as `typeormQueryMatcher` (and `createTypeormQueryMatcher(options)`) for custom `Ability`
instances.

## How rules are compiled

CASL evaluates rules last-to-first: the first matching rule wins, and a matching `cannot` denies. Every backend flattens
that into boolean logic once, then translates it:

| Rules                                                        | Meaning                           | `ofType()`                                         | `applyTo()` / MongoDB               |
| ------------------------------------------------------------ | --------------------------------- | -------------------------------------------------- | ----------------------------------- |
| `can(A)`, `can(B)`                                           | `A OR B`                          | `[A, B]`                                           | `(A) OR (B)`                        |
| `can(A)`, `cannot(C)`                                        | `A AND NOT C`                     | `[{ ...A, c: Not(v) }]`                            | `(A) AND NOT (C)`                   |
| `cannot({ secret: true, internal: true })`                   | `NOT (secret AND internal)`       | `[{ secret: Not(true) }, { internal: Not(true) }]` | `NOT (secret = 1 AND internal = 1)` |
| `can({ status: In(['a', 'b']) })`, `cannot({ status: 'b' })` | both constraints on one field     | `{ status: And(In([...]), Not('b')) }`             | two predicates                      |
| `cannot({ author: { banned: true } })`                       | no article whose author is banned | throws `UnsupportedConditionError`                 | `NOT EXISTS (…)` / `$nor`           |

## Supported operators

Query backends accept every TypeORM `FindOperator` that TypeORM itself supports in `where` for the database in use
(`Equal`, `Not`, `In`, `Any`, `LessThan(OrEqual)`, `MoreThan(OrEqual)`, `Between`, `Like`, `ILike`, `IsNull`, `And`,
`Or`, `Raw`, `ArrayContains`, `ArrayContainedBy`, `ArrayOverlap`, `JsonContains`). Plain arrays are treated as `In`.

| Operator                                            | `ability.can()` | MongoDB filter                        |
| --------------------------------------------------- | --------------- | ------------------------------------- |
| equality, `Equal`, `Not`, `In`, `Any`, plain arrays | yes             | `$eq`, `$ne`, `$in`                   |
| `LessThan(OrEqual)`, `MoreThan(OrEqual)`, `Between` | yes             | `$lt`, `$lte`, `$gt`, `$gte`          |
| `IsNull`, `Not(IsNull())`                           | yes             | `null`, `$nor`                        |
| `Like`, `ILike`                                     | yes             | `$regex`                              |
| `And`, `Or`                                         | yes             | `$and`, `$or`                         |
| `ArrayContains`, `ArrayContainedBy`, `ArrayOverlap` | yes             | `$all`, `$not $elemMatch $nin`, `$in` |
| `JsonContains`                                      | yes             | not supported (throws)                |
| `Raw`                                               | throws          | not supported (throws)                |

## Semantics and caveats

- **SQL `NULL` under negation.** `cannot('read', 'Article', { secret: true })` compiles to `NOT (secret = true)`, which
  SQL evaluates to `NULL` (excluded) when `secret` is `NULL`, while `ability.can()` on the same entity returns `true`
  (`null !== true`). Make nullable columns explicit in rules (`IsNull()`) or avoid negating nullable columns. MongoDB's
  `$nor` matches missing fields, consistent with the matcher.
- **Relation `FindOperator`s.** `{ comments: MoreThan(2) }` (relation count) is a `find()`-only TypeORM feature; the
  query builder backend throws `UnsupportedConditionError` for operators on to-many relations.
- **Serialization.** `FindOperator` instances are class instances, so rules containing them cannot be stored as JSON with
  `packRules`.

## API

### `createTypeOrmAbility(rules?, options?)`

Returns a `TypeOrmAbility<A>` (`Ability<A, TypeOrmQuery>`). `options` are CASL `Ability` options without
`conditionsMatcher`/`fieldMatcher`, plus `unloadedRelation?: 'throw' | 'deny'` (default `'throw'`).

### `accessibleBy(ability, action = 'read')`

Returns an `AccessibleRecords` with:

| Method                                 | Returns                                         |
| -------------------------------------- | ----------------------------------------------- |
| `ofType<T>(subjectType)`               | `FindOptionsWhere<T>[] \| null`                 |
| `applyTo(queryBuilder, options?)`      | the same `SelectQueryBuilder`                   |
| `toMongoQuery(subjectType, metadata?)` | MongoDB filter object `\| null`                 |
| `conditionTreeFor(subjectType)`        | the intermediate boolean tree (`ConditionTree`) |
| `subjectTypeFor(metadata)`             | subject type inferred from entity metadata      |

`subjectType` is whatever the rules use: a string or an entity class.

### `accessibleRecords`

Object for `repository.extend(accessibleRecords)` adding `accessibleBy(ability, action?, alias?)` (SQL only) and
`findAccessible(ability, action?, options?)` (SQL and MongoDB).

### `typeormQueryMatcher` / `createTypeormQueryMatcher(options?)`

The conditions matcher used by `createTypeOrmAbility`.

### Errors

`CaslTypeOrmError` is the base class; `UnsupportedConditionError` signals a condition the requested backend cannot
express.

## Migrating from v1

- The package is ESM-only and requires Node `^20.19 || ^22.13 || >=24.11`. CommonJS projects on those versions can still
  `require()` it.
- `ofType()` throws `UnsupportedConditionError` for a `cannot` rule on a relation instead of returning a where object
  TypeORM rejects; move such queries to `applyTo()` or `findAccessible()`.
- Multi-field `cannot` rules now produce one OR branch per field (correct `NOT (a AND b)`), and constraints on the same
  field from a `can` and a `cannot` rule are combined with `And()` instead of one overwriting the other.
- `ability.can()`: to-many relations match when any related record matches, arrays of nested conditions are OR, scalar
  arrays are `IN`, dates compare by value and ordered comparisons against `null` never match.
- `TypeOrmAbility` is now `Ability<A, TypeOrmQuery>`; `TypeOrmRawRule`, `TypeOrmQuery`, `TypeOrmAbilityOptions` are
  exported.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Integration tests run against SQLite in-process and against PostgreSQL, MySQL,
SQL Server and MongoDB in Docker (`DB=postgres pnpm test:integration`).

## License

MIT © [Mykhailo Toporkov](https://github.com/cookieMonsterDev)
