# @casl/typeorm

TypeORM integration for [CASL](https://casl.js.org) — query only the records a user is allowed to access.

## Installation

```sh
pnpm add @casl/typeorm @casl/ability typeorm
```

## Overview

`@casl/typeorm` provides two main building blocks:

- **`createTypeOrmAbility`** — creates a CASL `Ability` that accepts native TypeORM `FindOptionsWhere` conditions, enabling both database-level filtering and instance-level permission checks.
- **`accessibleBy`** — converts ability rules into a `FindOptionsWhere` array you can pass directly to TypeORM's `find`, `findOne`, or `findAndCount`.

## Usage

### 1. Define an ability

Use TypeORM operators directly as conditions — the same operators you already use in `find()`:

```ts
import { In, MoreThan, Not } from 'typeorm';
import { createTypeOrmAbility } from '@casl/typeorm';

// Rules are evaluated last-to-first: the last rule has the highest priority.
const ability = createTypeOrmAbility([
  { action: 'read', subject: 'Article', conditions: { published: true } },
  { action: 'read', subject: 'Article', conditions: { authorId: userId } },
  // This cannot rule is last → highest priority → overrides the can rules above
  {
    action: 'read',
    subject: 'Article',
    conditions: { status: In(['banned', 'deleted']) },
    inverted: true,
  },
]);
```

### 2. Filter database queries

```ts
import { accessibleBy } from '@casl/typeorm';

const where = accessibleBy(ability, 'read').ofType('Article');

if (!where) {
  // null means the user has no access to any records
  return [];
}

const articles = await articleRepository.find({ where });
```

`where` is a `FindOptionsWhere<Article>[]`. TypeORM treats an array as OR — each element is an AND-merged condition set. The result already encodes the full rule logic, including `cannot` constraints.

### 3. Instance-level checks

`createTypeOrmAbility` also wires up a runtime conditions matcher, so `ability.can()` works on individual entity instances:

```ts
import { subject } from '@casl/ability';

const article = await articleRepository.findOneBy({ id: 1 });

if (ability.can('read', subject('Article', article))) {
  // user is allowed
}
```

### Using with `AbilityBuilder`

```ts
import { AbilityBuilder } from '@casl/ability';
import { createTypeOrmAbility, TypeOrmAbility } from '@casl/typeorm';
import { Not } from 'typeorm';

type Actions = 'create' | 'read' | 'update' | 'delete';
type Subjects = 'Article' | 'Comment';

function defineAbilityFor(user: User): TypeOrmAbility<[Actions, Subjects]> {
  const { can, cannot, build } = new AbilityBuilder(createTypeOrmAbility);

  if (user.isAdmin) {
    can('manage', 'all');
  } else {
    can('read', 'Article', { published: true });
    can('read', 'Article', { authorId: user.id });
    cannot('read', 'Article', { secret: Not(false) });

    can('create', 'Comment');
    can('update', 'Comment', { authorId: user.id });
  }

  return build();
}
```

> `AbilityBuilder` follows the same last-wins priority: `cannot` defined after `can` overrides it.

## API

### `createTypeOrmAbility(rules?, options?)`

Creates a CASL `Ability` configured to use TypeORM `FindOptionsWhere` conditions.

| Parameter | Type                                 | Description                                                                      |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| `rules`   | `RawRuleFrom<A, FindOptionsWhere>[]` | Initial rules array                                                              |
| `options` | `AbilityOptions`                     | Standard CASL ability options (excluding `conditionsMatcher` and `fieldMatcher`) |

Returns a `TypeOrmAbility<A>` instance.

### `accessibleBy(ability, action?)`

Converts ability rules into an `AccessibleRecords` builder.

| Parameter | Type         | Default  |
| --------- | ------------ | -------- |
| `ability` | `AnyAbility` | —        |
| `action`  | `string`     | `'read'` |

#### `.ofType(subjectType)`

Returns `FindOptionsWhere<Entity>[] | null`.

- **Array** — use directly as the `where` option in `find()`, `findOne()`, etc.
- **`null`** — user has no access; handle by returning an empty result or throwing `ForbiddenError`.

```ts
const where = accessibleBy(ability).ofType(Article);
// or with a string subject:
const where = accessibleBy(ability).ofType('Article');
```

### `typeormQueryMatcher(conditions)`

The runtime conditions matcher used internally by `createTypeOrmAbility`. You can use it directly if you create a custom `Ability`:

```ts
import { Ability, fieldPatternMatcher } from '@casl/ability';
import { typeormQueryMatcher } from '@casl/typeorm';

const ability = new Ability(rules, {
  conditionsMatcher: typeormQueryMatcher,
  fieldMatcher: fieldPatternMatcher,
});
```

Supports: plain equality, `Not`, `In`, `MoreThan`, `MoreThanOrEqual`, `LessThan`, `LessThanOrEqual`, `IsNull`, `Between`, `Like`, `ILike`, `And`, `Or`, `ArrayContains`, `ArrayContainedBy`, `ArrayOverlap`.

> **`Raw` is not supported** for instance-level checks — it can only be used in query conditions.

## Limitations

**Multi-field `cannot` conditions** are approximated at the field level. Given:

```ts
cannot('read', 'Article', { secret: true, internal: true });
```

The generated condition is `{ secret: Not(true), internal: Not(true) }` which evaluates as `secret != true AND internal != true`. The semantically correct form is `NOT (secret = true AND internal = true)` = `secret != true OR internal != true`. For single-field conditions, the behaviour is exact.

## License

MIT © [Mykhailo Toporkov](https://github.com/cookieMonsterDev)
