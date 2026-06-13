import { rulesToCondition } from '@casl/ability/extra';
import type { AnyAbility, SubjectType } from '@casl/ability';
import { Not } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';

type WhereGroup = FindOptionsWhere<unknown>[];

function negateConditionFields(conditions: Record<string, unknown>): FindOptionsWhere<unknown> {
  return Object.fromEntries(
    Object.entries(conditions).map(([key, value]) => [key, Not(value as never)]),
  );
}

function convertRule(rule: AnyAbility['rules'][number]): WhereGroup {
  if (rule.inverted) {
    if (!rule.conditions) return [];
    return [negateConditionFields(rule.conditions as Record<string, unknown>)];
  }
  return [(rule.conditions as FindOptionsWhere<unknown>) ?? {}];
}

const TYPEORM_AGGREGATION = {
  and: (groups: WhereGroup[]): WhereGroup =>
    groups.reduce((acc, curr) => acc.flatMap((a) => curr.map((c) => ({ ...a, ...c }))), [
      {},
    ] as WhereGroup),
  or: (groups: WhereGroup[]): WhereGroup => groups.flat(),
  empty: (): WhereGroup => [{}],
};

export class AccessibleRecords {
  constructor(
    private readonly _ability: AnyAbility,
    private readonly _action: string,
  ) {}

  ofType<T extends object>(
    subjectType: SubjectType | (new (...args: never[]) => T),
  ): FindOptionsWhere<T>[] | null {
    const rules = this._ability.rulesFor(this._action, subjectType as SubjectType);
    return rulesToCondition(rules, convertRule, TYPEORM_AGGREGATION) as
      | FindOptionsWhere<T>[]
      | null;
  }
}

export function accessibleBy(ability: AnyAbility, action = 'read'): AccessibleRecords {
  return new AccessibleRecords(ability, action);
}
