import { In, MoreThan, Not } from 'typeorm';
import { accessibleBy } from './accessible-by';
import { createTypeOrmAbility } from './create-typeorm-ability';

describe('accessibleBy', () => {
  describe('basic can rules', () => {
    it('returns null when no rules are defined', () => {
      const ability = createTypeOrmAbility([]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toBeNull();
    });

    it('returns [{}] when there is an unconditional can rule', () => {
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post' }]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{}]);
    });

    it('returns conditions from a single can rule', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ published: true }]);
    });

    it('returns OR conditions from multiple can rules (last defined = first in result)', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
        { action: 'read', subject: 'Post', conditions: { authorId: 1 } },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      // Last defined has highest priority → appears first in result
      expect(result).toEqual([{ authorId: 1 }, { published: true }]);
    });

    it('uses read as the default action', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
      ]);
      const result = accessibleBy(ability).ofType('Post');
      expect(result).toEqual([{ published: true }]);
    });
  });

  describe('cannot rules', () => {
    it('returns null when there is an unconditional cannot rule', () => {
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', inverted: true }]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toBeNull();
    });

    it('applies cannot conditions as NOT constraints (cannot defined last = highest priority)', () => {
      const ability = createTypeOrmAbility([
        // can defined first = lower priority
        { action: 'read', subject: 'Post', conditions: { published: true } },
        // cannot defined last = higher priority → constrains the can rule
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ published: true, secret: Not(true) }]);
    });

    it('applies cannot to unconditional can as standalone NOT condition', () => {
      const ability = createTypeOrmAbility([
        // can defined first = lower priority
        { action: 'read', subject: 'Post' },
        // cannot defined last = higher priority
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ secret: Not(true) }]);
    });

    it('applies cannot conditions to all can branches', () => {
      const ability = createTypeOrmAbility([
        // can rules defined first = lower priority
        { action: 'read', subject: 'Post', conditions: { published: true } },
        { action: 'read', subject: 'Post', conditions: { authorId: 1 } },
        // cannot defined last = highest priority → constrains all can rules
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      // Last-defined can rules appear first (authorId was 2nd-to-last, published was first)
      expect(result).toEqual([
        { authorId: 1, secret: Not(true) },
        { published: true, secret: Not(true) },
      ]);
    });
  });

  describe('with TypeORM operators in conditions', () => {
    it('supports In operator in conditions', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { status: In(['active', 'published']) } },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ status: In(['active', 'published']) }]);
    });

    it('supports MoreThan operator in conditions', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { views: MoreThan(100) } },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ views: MoreThan(100) }]);
    });

    it('wraps FindOperator conditions with Not when inverted (cannot defined last = highest priority)', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post' },
        {
          action: 'read',
          subject: 'Post',
          conditions: { status: In(['banned', 'deleted']) },
          inverted: true,
        },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ status: Not(In(['banned', 'deleted'])) }]);
    });
  });

  describe('subject type detection', () => {
    it('returns null for an action not defined in rules', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
      ]);
      const result = accessibleBy(ability, 'update').ofType('Post');
      expect(result).toBeNull();
    });

    it('returns null for a subject not defined in rules', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Comment');
      expect(result).toBeNull();
    });
  });
});
