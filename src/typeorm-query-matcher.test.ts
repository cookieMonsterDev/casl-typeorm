import { describe, expect, it } from 'vitest';
import {
  And,
  Any,
  ArrayContainedBy,
  ArrayContains,
  ArrayOverlap,
  Between,
  Equal,
  ILike,
  In,
  IsNull,
  JsonContains,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Or,
  Raw,
} from 'typeorm';
import { typeormQueryMatcher } from './typeorm-query-matcher';

function matches(conditions: object, entity: object): boolean {
  return typeormQueryMatcher(conditions)(entity);
}

describe('typeormQueryMatcher', () => {
  describe('plain equality', () => {
    it('matches equal scalar values', () => {
      expect(matches({ status: 'active' }, { status: 'active' })).toBe(true);
      expect(matches({ status: 'active' }, { status: 'inactive' })).toBe(false);
    });

    it('matches multiple conditions (AND logic)', () => {
      expect(matches({ published: true, authorId: 1 }, { published: true, authorId: 1 })).toBe(true);
      expect(matches({ published: true, authorId: 1 }, { published: true, authorId: 2 })).toBe(false);
    });

    it('handles missing fields as undefined', () => {
      expect(matches({ authorId: undefined }, { otherField: 'value' })).toBe(true);
    });
  });

  describe('comparison operators', () => {
    it('MoreThan', () => {
      expect(matches({ age: MoreThan(18) }, { age: 25 })).toBe(true);
      expect(matches({ age: MoreThan(18) }, { age: 18 })).toBe(false);
      expect(matches({ age: MoreThan(18) }, { age: 10 })).toBe(false);
    });

    it('MoreThanOrEqual', () => {
      expect(matches({ age: MoreThanOrEqual(18) }, { age: 18 })).toBe(true);
      expect(matches({ age: MoreThanOrEqual(18) }, { age: 17 })).toBe(false);
    });

    it('LessThan', () => {
      expect(matches({ price: LessThan(100) }, { price: 50 })).toBe(true);
      expect(matches({ price: LessThan(100) }, { price: 100 })).toBe(false);
    });

    it('LessThanOrEqual', () => {
      expect(matches({ price: LessThanOrEqual(100) }, { price: 100 })).toBe(true);
      expect(matches({ price: LessThanOrEqual(100) }, { price: 101 })).toBe(false);
    });
  });

  describe('Not operator', () => {
    it('negates plain values', () => {
      expect(matches({ secret: Not(true) }, { secret: false })).toBe(true);
      expect(matches({ secret: Not(true) }, { secret: true })).toBe(false);
    });

    it('negates other operators (Not(MoreThan))', () => {
      expect(matches({ age: Not(MoreThan(18)) }, { age: 18 })).toBe(true);
      expect(matches({ age: Not(MoreThan(18)) }, { age: 19 })).toBe(false);
    });

    it('negates In operator', () => {
      expect(matches({ status: Not(In(['banned', 'deleted'])) }, { status: 'active' })).toBe(true);
      expect(matches({ status: Not(In(['banned', 'deleted'])) }, { status: 'banned' })).toBe(false);
    });

    it('negates IsNull (Not(IsNull) = field is not null)', () => {
      expect(matches({ deletedAt: Not(IsNull()) }, { deletedAt: '2024-01-01' })).toBe(true);
      expect(matches({ deletedAt: Not(IsNull()) }, { deletedAt: null })).toBe(false);
    });
  });

  describe('In operator', () => {
    it('matches values in array', () => {
      expect(matches({ role: In(['admin', 'editor']) }, { role: 'admin' })).toBe(true);
      expect(matches({ role: In(['admin', 'editor']) }, { role: 'viewer' })).toBe(false);
    });
  });

  describe('IsNull operator', () => {
    it('matches null values', () => {
      expect(matches({ deletedAt: IsNull() }, { deletedAt: null })).toBe(true);
      expect(matches({ deletedAt: IsNull() }, { deletedAt: undefined })).toBe(true);
      expect(matches({ deletedAt: IsNull() }, { deletedAt: '2024-01-01' })).toBe(false);
    });
  });

  describe('Between operator', () => {
    it('matches values within range', () => {
      expect(matches({ age: Between(18, 65) }, { age: 25 })).toBe(true);
      expect(matches({ age: Between(18, 65) }, { age: 18 })).toBe(true);
      expect(matches({ age: Between(18, 65) }, { age: 65 })).toBe(true);
      expect(matches({ age: Between(18, 65) }, { age: 17 })).toBe(false);
      expect(matches({ age: Between(18, 65) }, { age: 66 })).toBe(false);
    });
  });

  describe('Like and ILike operators', () => {
    it('Like matches SQL wildcard pattern (case-sensitive)', () => {
      expect(matches({ name: Like('%John%') }, { name: 'John Doe' })).toBe(true);
      expect(matches({ name: Like('John%') }, { name: 'Johnny' })).toBe(true);
      expect(matches({ name: Like('%Doe') }, { name: 'Jane Doe' })).toBe(true);
      expect(matches({ name: Like('%John%') }, { name: 'Jane Doe' })).toBe(false);
    });

    it('ILike matches case-insensitively', () => {
      expect(matches({ name: ILike('%john%') }, { name: 'John Doe' })).toBe(true);
      expect(matches({ name: ILike('%JOHN%') }, { name: 'john doe' })).toBe(true);
    });
  });

  describe('And and Or operators', () => {
    it('And requires all sub-conditions to match', () => {
      expect(matches({ age: And(MoreThan(18), LessThan(65)) }, { age: 30 })).toBe(true);
      expect(matches({ age: And(MoreThan(18), LessThan(65)) }, { age: 18 })).toBe(false);
      expect(matches({ age: And(MoreThan(18), LessThan(65)) }, { age: 65 })).toBe(false);
    });

    it('Or requires at least one sub-condition to match', () => {
      expect(matches({ status: Or(In(['active']), In(['pending'])) }, { status: 'active' })).toBe(true);
      expect(matches({ status: Or(In(['active']), In(['pending'])) }, { status: 'pending' })).toBe(true);
      expect(matches({ status: Or(In(['active']), In(['pending'])) }, { status: 'deleted' })).toBe(false);
    });
  });

  describe('nested conditions (relations)', () => {
    it('matches nested object conditions', () => {
      expect(matches({ author: { id: 1 } }, { author: { id: 1, name: 'Alice' } })).toBe(true);
      expect(matches({ author: { id: 1 } }, { author: { id: 2, name: 'Bob' } })).toBe(false);
    });

    it('returns false when nested relation field is null', () => {
      expect(matches({ author: { id: 1 } }, { author: null })).toBe(false);
    });

    it('throws when nested relation field is undefined (not loaded)', () => {
      expect(() => matches({ author: { id: 1 } }, {})).toThrow(
        'Relation "author" is not loaded. Load the relation before checking ability.can().',
      );
    });
  });

  describe('error cases', () => {
    it('throws for Raw operator', () => {
      expect(() => matches({ id: Raw(() => '1 = 0') }, { id: 1 })).toThrow(
        'Raw operator is not supported for runtime ability checks',
      );
    });
  });
});

describe('typeormQueryMatcher › relations and value types', () => {
  it('matches a to-many relation when at least one related record matches', () => {
    const post = { comments: [{ approved: false }, { approved: true }] };
    expect(matches({ comments: { approved: true } }, post)).toBe(true);
    expect(matches({ comments: { approved: true } }, { comments: [{ approved: false }] })).toBe(false);
    expect(matches({ comments: { approved: true } }, { comments: [] })).toBe(false);
  });

  it('throws when a to-many relation is not loaded', () => {
    expect(() => matches({ comments: { approved: true } }, {})).toThrow(/Relation "comments" is not loaded/);
  });

  it('treats an array of nested conditions as OR', () => {
    const conditions = { author: [{ id: 1 }, { role: 'admin' }] };
    expect(matches(conditions, { author: { id: 2, role: 'admin' } })).toBe(true);
    expect(matches(conditions, { author: { id: 1, role: 'user' } })).toBe(true);
    expect(matches(conditions, { author: { id: 2, role: 'user' } })).toBe(false);
  });

  it('treats a top-level array of conditions as OR', () => {
    const conditions = [{ published: true }, { authorId: 1 }];
    expect(matches(conditions, { published: false, authorId: 1 })).toBe(true);
    expect(matches(conditions, { published: false, authorId: 2 })).toBe(false);
  });

  it('treats a scalar array as IN, like TypeORM does', () => {
    expect(matches({ status: ['a', 'b'] }, { status: 'b' })).toBe(true);
    expect(matches({ status: ['a', 'b'] }, { status: 'c' })).toBe(false);
  });

  it('compares dates by value', () => {
    const day = new Date('2024-01-01T00:00:00Z');
    expect(matches({ createdAt: new Date(day) }, { createdAt: day })).toBe(true);
    expect(matches({ createdAt: In([new Date(day)]) }, { createdAt: day })).toBe(true);
    expect(matches({ createdAt: MoreThan(new Date('2023-12-31')) }, { createdAt: day })).toBe(true);
    expect(matches({ createdAt: Between(new Date('2023-12-31'), new Date('2024-01-02')) }, { createdAt: day })).toBe(
      true,
    );
    expect(matches({ createdAt: LessThan(new Date('2023-12-31')) }, { createdAt: day })).toBe(false);
  });

  it('compares values with an equals() method by value', () => {
    class Id {
      constructor(readonly value: string) {}
      equals(other: unknown): boolean {
        return other instanceof Id && other.value === this.value;
      }
    }
    expect(matches({ id: new Id('a') }, { id: new Id('a') })).toBe(true);
    expect(matches({ id: new Id('a') }, { id: new Id('b') })).toBe(false);
  });

  it('never matches ordered comparisons against null, like SQL', () => {
    expect(matches({ views: MoreThan(1) }, { views: null })).toBe(false);
    expect(matches({ views: LessThan(1) }, { views: null })).toBe(false);
    expect(matches({ views: Between(0, 1) }, { views: undefined })).toBe(false);
    expect(matches({ name: Like('%a%') }, { name: null })).toBe(false);
  });

  it('supports Equal, Any and JsonContains', () => {
    expect(matches({ status: Equal('a') }, { status: 'a' })).toBe(true);
    expect(matches({ status: Any(['a', 'b']) }, { status: 'b' })).toBe(true);
    expect(matches({ status: Any(['a', 'b']) }, { status: 'c' })).toBe(false);
    expect(matches({ meta: JsonContains({ tags: ['x'] }) }, { meta: { tags: ['x', 'y'], other: 1 } })).toBe(true);
    expect(matches({ meta: JsonContains({ tags: ['z'] }) }, { meta: { tags: ['x', 'y'] } })).toBe(false);
    expect(matches({ meta: JsonContains({ a: { b: 1 } }) }, { meta: { a: { b: 1, c: 2 } } })).toBe(true);
  });

  it('supports array operators', () => {
    expect(matches({ tags: ArrayContains(['a']) }, { tags: ['a', 'b'] })).toBe(true);
    expect(matches({ tags: ArrayContainedBy(['a', 'b', 'c']) }, { tags: ['a', 'b'] })).toBe(true);
    expect(matches({ tags: ArrayContainedBy(['a']) }, { tags: ['a', 'b'] })).toBe(false);
    expect(matches({ tags: ArrayOverlap(['c', 'b']) }, { tags: ['a', 'b'] })).toBe(true);
    expect(matches({ tags: ArrayOverlap(['c']) }, { tags: ['a', 'b'] })).toBe(false);
  });

  it('skips undefined condition values', () => {
    expect(matches({ status: undefined, published: true }, { published: true })).toBe(true);
  });
});
