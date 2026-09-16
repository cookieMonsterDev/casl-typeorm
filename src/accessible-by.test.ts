import { describe, expect, it } from 'vitest';
import { And, In, IsNull, MoreThan, Not } from 'typeorm';
import { UnsupportedConditionError } from './errors';
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
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', conditions: { published: true } }]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ published: true }]);
    });

    it('returns OR conditions from multiple can rules (last defined = first in result)', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
        { action: 'read', subject: 'Post', conditions: { authorId: 1 } },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ authorId: 1 }, { published: true }]);
    });

    it('uses read as the default action', () => {
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', conditions: { published: true } }]);
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
        { action: 'read', subject: 'Post', conditions: { published: true } },
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ published: true, secret: Not(true) }]);
    });

    it('applies cannot to unconditional can as standalone NOT condition', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post' },
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
      expect(result).toEqual([{ secret: Not(true) }]);
    });

    it('applies cannot conditions to all can branches', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
        { action: 'read', subject: 'Post', conditions: { authorId: 1 } },
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      const result = accessibleBy(ability, 'read').ofType('Post');
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
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', conditions: { views: MoreThan(100) } }]);
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
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', conditions: { published: true } }]);
      const result = accessibleBy(ability, 'update').ofType('Post');
      expect(result).toBeNull();
    });

    it('returns null for a subject not defined in rules', () => {
      const ability = createTypeOrmAbility([{ action: 'read', subject: 'Post', conditions: { published: true } }]);
      const result = accessibleBy(ability, 'read').ofType('Comment');
      expect(result).toBeNull();
    });
  });
});

describe('accessibleBy › boolean semantics', () => {
  it('turns a multi-field cannot into OR branches (De Morgan)', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { secret: true, internal: true }, inverted: true },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ secret: Not(true) }, { internal: Not(true) }]);
  });

  it('distributes a multi-field cannot over every can branch', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post', conditions: { published: true } },
      { action: 'read', subject: 'Post', conditions: { secret: true, internal: true }, inverted: true },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([
      { published: true, secret: Not(true) },
      { published: true, internal: Not(true) },
    ]);
  });

  it('combines several cannot rules with AND', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { archived: true }, inverted: true },
      { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ secret: Not(true), archived: Not(true) }]);
  });

  it('joins constraints on the same field with And() instead of overwriting', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post', conditions: { status: In(['draft', 'published']) } },
      { action: 'read', subject: 'Post', conditions: { status: 'draft' }, inverted: true },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ status: And(In(['draft', 'published']), Not('draft')) }]);
  });

  it('negates a scalar array with Not(In())', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { status: ['banned', 'deleted'] }, inverted: true },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ status: Not(In(['banned', 'deleted'])) }]);
  });

  it('passes nested relation conditions of can rules through', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post', conditions: { author: { id: 1 }, comments: { approved: true } } },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ author: { id: 1 }, comments: { approved: true } }]);
  });

  it('throws UnsupportedConditionError for a cannot rule on a relation', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { author: { banned: true } }, inverted: true },
    ]);
    expect(() => accessibleBy(ability).ofType('Post')).toThrow(UnsupportedConditionError);
    expect(() => accessibleBy(ability).ofType('Post')).toThrow(/relation "author"/);
  });

  it('throws UnsupportedConditionError for a cannot rule with a relation OR list', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { author: [{ id: 1 }, { id: 2 }] }, inverted: true },
    ]);
    expect(() => accessibleBy(ability).ofType('Post')).toThrow(UnsupportedConditionError);
  });

  it('accepts entity classes as subject types', () => {
    class Post {}
    const ability = createTypeOrmAbility([{ action: 'read', subject: Post, conditions: { published: true } }]);
    expect(accessibleBy(ability).ofType(Post)).toEqual([{ published: true }]);
  });
});

describe('accessibleBy › null and array normalisation', () => {
  it('compiles null to IsNull() and scalar arrays to In(), like the matcher reads them', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post', conditions: { deletedAt: null, status: ['draft', 'published'] } },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ deletedAt: IsNull(), status: In(['draft', 'published']) }]);
  });

  it('negates null as Not(IsNull()) instead of the never-true Not(null)', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post' },
      { action: 'read', subject: 'Post', conditions: { deletedAt: null }, inverted: true },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([{ deletedAt: Not(IsNull()) }]);
  });

  it('normalises inside nested relation objects and relation OR lists', () => {
    const ability = createTypeOrmAbility([
      { action: 'read', subject: 'Post', conditions: { author: [{ deletedAt: null }, { role: ['admin', 'editor'] }] } },
    ]);
    expect(accessibleBy(ability).ofType('Post')).toEqual([
      { author: [{ deletedAt: IsNull() }, { role: In(['admin', 'editor']) }] },
    ]);
  });
});
