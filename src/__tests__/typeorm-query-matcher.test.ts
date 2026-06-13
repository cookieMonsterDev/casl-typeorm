import {
  And,
  Between,
  ILike,
  In,
  IsNull,
  Like,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Or,
} from 'typeorm';
import { typeormQueryMatcher } from '../typeorm-query-matcher';

function matches(conditions: object, entity: object): boolean {
  return typeormQueryMatcher(conditions as never)(entity);
}

describe('typeormQueryMatcher', () => {
  describe('plain equality', () => {
    it('matches equal scalar values', () => {
      expect(matches({ status: 'active' }, { status: 'active' })).toBe(true);
      expect(matches({ status: 'active' }, { status: 'inactive' })).toBe(false);
    });

    it('matches multiple conditions (AND logic)', () => {
      expect(matches({ published: true, authorId: 1 }, { published: true, authorId: 1 })).toBe(
        true,
      );
      expect(matches({ published: true, authorId: 1 }, { published: true, authorId: 2 })).toBe(
        false,
      );
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
      expect(matches({ status: Or(In(['active']), In(['pending'])) }, { status: 'active' })).toBe(
        true,
      );
      expect(matches({ status: Or(In(['active']), In(['pending'])) }, { status: 'pending' })).toBe(
        true,
      );
      expect(matches({ status: Or(In(['active']), In(['pending'])) }, { status: 'deleted' })).toBe(
        false,
      );
    });
  });

  describe('nested conditions (relations)', () => {
    it('matches nested object conditions', () => {
      expect(matches({ author: { id: 1 } }, { author: { id: 1, name: 'Alice' } })).toBe(true);
      expect(matches({ author: { id: 1 } }, { author: { id: 2, name: 'Bob' } })).toBe(false);
    });
  });

  describe('error cases', () => {
    it('throws for Raw operator', () => {
      const { Raw } = require('typeorm');
      expect(() => matches({ id: Raw(() => '1 = 0') }, { id: 1 })).toThrow(
        'Raw operator is not supported for runtime ability checks',
      );
    });
  });
});
