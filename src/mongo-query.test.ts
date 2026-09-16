import { ObjectId } from 'mongodb';
import {
  And,
  ArrayContainedBy,
  ArrayContains,
  Between,
  ILike,
  In,
  IsNull,
  JsonContains,
  Like,
  MoreThan,
  Not,
  Or,
} from 'typeorm';
import { describe, expect, it } from 'vitest';
import { accessibleBy } from './accessible-by';
import { createTypeOrmAbility } from './create-typeorm-ability';
import { UnsupportedConditionError } from './errors';

function query(rules: Parameters<typeof createTypeOrmAbility>[0], objectIdProperty?: string) {
  const ability = createTypeOrmAbility(rules);
  const metadata = objectIdProperty ? { objectIdColumn: { propertyName: objectIdProperty } } : undefined;
  return accessibleBy(ability).toMongoQuery('Post', metadata as never);
}

describe('toMongoQuery', () => {
  it('returns null without access and {} for unconditional access', () => {
    expect(query([])).toBeNull();
    expect(query([{ action: 'read', subject: 'Post' }])).toEqual({});
  });

  it('merges scalar conditions and flattens embedded documents to dotted paths', () => {
    expect(
      query([
        { action: 'read', subject: 'Post', conditions: { published: true, meta: { locale: 'en', revision: 1 } } },
      ]),
    ).toEqual({ published: true, 'meta.locale': 'en', 'meta.revision': 1 });
  });

  it('translates operators', () => {
    const conditions = {
      a: Not('x'),
      b: In([1, 2]),
      c: MoreThan(5),
      d: IsNull(),
      e: Like('a%'),
      f: ILike('%b_'),
      g: Between(1, 3),
      h: ArrayContains(['t']),
      i: ArrayContainedBy(['t', 'u']),
      j: Not(IsNull()),
      k: [1, 2],
    };
    expect(query([{ action: 'read', subject: 'Post', conditions }])).toEqual({
      a: { $ne: 'x' },
      b: { $in: [1, 2] },
      c: { $gt: 5 },
      d: null,
      e: { $regex: /^a.*$/s },
      f: { $regex: /^.*b.$/is },
      g: { $gte: 1, $lte: 3 },
      h: { $all: ['t'] },
      i: { $not: { $elemMatch: { $nin: ['t', 'u'] } } },
      $nor: [{ j: null }],
      k: { $in: [1, 2] },
    });
  });

  it('uses $and when the same path is constrained twice', () => {
    expect(query([{ action: 'read', subject: 'Post', conditions: { views: And(MoreThan(1), Not(5)) } }])).toEqual({
      $and: [{ views: { $gt: 1 } }, { views: { $ne: 5 } }],
    });
    expect(query([{ action: 'read', subject: 'Post', conditions: { views: Or(MoreThan(10), In([1])) } }])).toEqual({
      $or: [{ views: { $gt: 10 } }, { views: { $in: [1] } }],
    });
  });

  it('combines rules with $or and $nor', () => {
    expect(
      query([
        { action: 'read', subject: 'Post', conditions: { published: true } },
        { action: 'read', subject: 'Post', conditions: { authorId: 1 } },
        { action: 'read', subject: 'Post', conditions: { secret: true, internal: true }, inverted: true },
      ]),
    ).toEqual({
      $or: [
        { authorId: 1, $nor: [{ secret: true, internal: true }] },
        { published: true, $nor: [{ secret: true, internal: true }] },
      ],
    });
  });

  it('supports relation-style OR lists on embedded documents', () => {
    expect(
      query([{ action: 'read', subject: 'Post', conditions: { author: [{ name: 'a' }, { role: 'admin' }] } }]),
    ).toEqual({ $or: [{ 'author.name': 'a' }, { 'author.role': 'admin' }] });
  });

  it('renames the ObjectId property to _id, including inside $nor', () => {
    const id = new ObjectId();
    expect(
      query(
        [
          { action: 'read', subject: 'Post' },
          { action: 'read', subject: 'Post', conditions: { id }, inverted: true },
        ],
        'id',
      ),
    ).toEqual({ $nor: [{ _id: id }] });
  });

  it('rejects operators MongoDB cannot express', () => {
    expect(() => query([{ action: 'read', subject: 'Post', conditions: { meta: JsonContains({ a: 1 }) } }])).toThrow(
      UnsupportedConditionError,
    );
  });
});
