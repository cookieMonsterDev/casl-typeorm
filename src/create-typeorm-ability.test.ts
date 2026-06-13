import { subject } from '@casl/ability';
import { In, MoreThan, Not } from 'typeorm';
import { createTypeOrmAbility } from '@/create-typeorm-ability';

describe('createTypeOrmAbility', () => {
  it('creates an ability instance', () => {
    const ability = createTypeOrmAbility([]);
    expect(ability).toBeDefined();
    expect(typeof ability.can).toBe('function');
    expect(typeof ability.cannot).toBe('function');
  });

  describe('instance-level checks (can/cannot)', () => {
    it('checks plain equality conditions', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
      ]);

      expect(ability.can('read', { published: true } as never, 'Post')).toBe(false);
    });

    it('evaluates plain equality on subject object', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { published: true } },
      ]);
      const post = { published: true, authorId: 1 };

      const taggedPost = subject('Post', post);
      expect(ability.can('read', taggedPost)).toBe(true);

      const unpublishedPost = subject('Post', { published: false, authorId: 1 });
      expect(ability.can('read', unpublishedPost)).toBe(false);
    });

    it('evaluates MoreThan operator', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { views: MoreThan(100) } },
      ]);
      expect(ability.can('read', subject('Post', { views: 200 }))).toBe(true);
      expect(ability.can('read', subject('Post', { views: 50 }))).toBe(false);
    });

    it('evaluates In operator', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { status: In(['active', 'published']) } },
      ]);
      expect(ability.can('read', subject('Post', { status: 'active' }))).toBe(true);
      expect(ability.can('read', subject('Post', { status: 'published' }))).toBe(true);
      expect(ability.can('read', subject('Post', { status: 'deleted' }))).toBe(false);
    });

    it('evaluates Not operator', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post', conditions: { secret: Not(true) } },
      ]);
      expect(ability.can('read', subject('Post', { secret: false }))).toBe(true);
      expect(ability.can('read', subject('Post', { secret: true }))).toBe(false);
    });

    it('allows unconditional access', () => {
      const ability = createTypeOrmAbility([{ action: 'manage', subject: 'all' }]);
      expect(ability.can('read', subject('Post', {}))).toBe(true);
      expect(ability.can('update', subject('Post', {}))).toBe(true);
      expect(ability.can('delete', subject('Comment', {}))).toBe(true);
    });

    it('denies when cannot overrides can', () => {
      const ability = createTypeOrmAbility([
        { action: 'read', subject: 'Post' },
        { action: 'read', subject: 'Post', conditions: { secret: true }, inverted: true },
      ]);
      expect(ability.can('read', subject('Post', { secret: false }))).toBe(true);
      expect(ability.can('read', subject('Post', { secret: true }))).toBe(false);
    });
  });
});
