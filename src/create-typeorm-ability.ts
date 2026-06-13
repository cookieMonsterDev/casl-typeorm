import {
  Ability,
  fieldPatternMatcher,
  type AbilityOptionsOf,
  type AbilityTuple,
  type MongoAbility,
  type RawRuleFrom,
} from '@casl/ability';
import type { FindOptionsWhere } from 'typeorm';
import { typeormQueryMatcher } from './typeorm-query-matcher';

export type TypeOrmAbility<A extends AbilityTuple = AbilityTuple> = MongoAbility<
  A,
  FindOptionsWhere<object>
>;

export function createTypeOrmAbility<A extends AbilityTuple = AbilityTuple>(
  rules: RawRuleFrom<A, FindOptionsWhere<object>>[] = [],
  options: Omit<AbilityOptionsOf<TypeOrmAbility<A>>, 'conditionsMatcher' | 'fieldMatcher'> = {},
): TypeOrmAbility<A> {
  return new Ability<A, FindOptionsWhere<object>>(rules, {
    ...options,
    conditionsMatcher: typeormQueryMatcher as never,
    fieldMatcher: fieldPatternMatcher,
  });
}
