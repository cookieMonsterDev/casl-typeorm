import { Not } from 'typeorm';
import { type FindOptionsWhere } from 'typeorm';
import { rulesToCondition } from '@casl/ability/extra';
import { type AnyAbility, type SubjectType } from '@casl/ability';

type WhereGroup = FindOptionsWhere<unknown>[];

function negateConditionFields(conditions: Record<string, unknown>): FindOptionsWhere<unknown> {
  return Object.fromEntries(Object.entries(conditions).map(([key, value]) => [key, Not(value as never)]));
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
    groups.reduce((acc, curr) => acc.flatMap((a) => curr.map((c) => ({ ...a, ...c }))), [{}] as WhereGroup),
  or: (groups: WhereGroup[]): WhereGroup => groups.flat(),
  empty: (): WhereGroup => [{}],
};

export class AccessibleRecords {
  private readonly _ability: AnyAbility;
  private readonly _action: string;

  constructor(ability: AnyAbility, action: string) {
    this._ability = ability;
    this._action = action;
  }

  ofType<T extends object>(subjectType: SubjectType | (new (...args: never[]) => T)): FindOptionsWhere<T>[] | null {
    const rules = this._ability.rulesFor(this._action, subjectType);
    return rulesToCondition(rules, convertRule, TYPEORM_AGGREGATION);
  }
}

export function accessibleBy(ability: AnyAbility, action = 'read'): AccessibleRecords {
  return new AccessibleRecords(ability, action);
}
