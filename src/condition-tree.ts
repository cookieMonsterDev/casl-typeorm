import type { AnyAbility, RuleOf } from '@casl/ability';
import { rulesToCondition } from '@casl/ability/extra';
import type { ObjectLiteral } from 'typeorm';

/**
 * Boolean combination of TypeORM `FindOptionsWhere` fragments. CASL's sequential rule priority is
 * flattened into this tree once; every backend (find options, query builder, MongoDB filter) then
 * only has to translate `and`, `or`, `not` and a single `where` fragment.
 */
export type ConditionTree =
  | { readonly kind: 'where'; readonly conditions: ObjectLiteral }
  | { readonly kind: 'and'; readonly nodes: readonly ConditionTree[] }
  | { readonly kind: 'or'; readonly nodes: readonly ConditionTree[] }
  | { readonly kind: 'not'; readonly node: ConditionTree }
  | { readonly kind: 'always' };

const ALWAYS: ConditionTree = { kind: 'always' };

function convertRule(rule: RuleOf<AnyAbility>): ConditionTree {
  const where: ConditionTree = { kind: 'where', conditions: rule.conditions as ObjectLiteral };
  return rule.inverted ? { kind: 'not', node: where } : where;
}

/**
 * Returns the condition tree for the given rules (highest priority first, as returned by
 * `ability.rulesFor()`), or `null` when the rules grant no access at all.
 */
export function rulesToConditionTree(rules: readonly RuleOf<AnyAbility>[]): ConditionTree | null {
  return rulesToCondition<AnyAbility, ConditionTree, ConditionTree>(rules, convertRule, {
    and: (nodes) => ({ kind: 'and', nodes }),
    or: (nodes) => ({ kind: 'or', nodes }),
    empty: () => ALWAYS,
  });
}
