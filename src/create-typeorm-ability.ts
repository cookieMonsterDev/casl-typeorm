import {
  type AbilityOptionsOf,
  type AbilityTuple,
  fieldPatternMatcher,
  Ability,
  type RawRuleFrom,
} from '@casl/ability';
import type { FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { typeormQueryMatcher } from './typeorm-query-matcher';

/** Rule conditions accepted by a `TypeOrmAbility`: TypeORM's `FindOptionsWhere` (or an OR array of them). */
export type TypeOrmQuery<T extends ObjectLiteral = ObjectLiteral> = FindOptionsWhere<T> | FindOptionsWhere<T>[];

export type TypeOrmAbility<A extends AbilityTuple = AbilityTuple> = Ability<A, TypeOrmQuery>;

export type TypeOrmRawRule<A extends AbilityTuple = AbilityTuple> = RawRuleFrom<A, TypeOrmQuery>;

export type TypeOrmAbilityOptions<A extends AbilityTuple = AbilityTuple> = Omit<
  AbilityOptionsOf<TypeOrmAbility<A>>,
  'conditionsMatcher' | 'fieldMatcher'
>;

/**
 * Creates a CASL ability whose rule conditions are TypeORM `FindOptionsWhere` objects, so the same
 * conditions drive both `ability.can()` on entity instances and database query filtering.
 */
export function createTypeOrmAbility<A extends AbilityTuple = AbilityTuple>(
  rules: TypeOrmRawRule<A>[] = [],
  options: TypeOrmAbilityOptions<A> = {},
): TypeOrmAbility<A> {
  return new Ability<A, TypeOrmQuery>(rules, {
    ...options,
    conditionsMatcher: typeormQueryMatcher,
    fieldMatcher: fieldPatternMatcher,
  });
}
