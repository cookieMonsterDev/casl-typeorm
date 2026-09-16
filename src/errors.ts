/** Base class of every error thrown by this package. */
export class CaslTypeOrmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaslTypeOrmError';
  }
}

/**
 * Thrown by `ability.can()` when a condition targets a nested property that is `undefined` on the
 * entity, i.e. a relation that was not loaded. See `unloadedRelation` in `createTypeOrmAbility()`.
 */
export class RelationNotLoadedError extends CaslTypeOrmError {
  constructor(property: string) {
    super(
      `Relation "${property}" is not loaded. Load the relation before checking ability.can(), ` +
        "or create the ability with { unloadedRelation: 'deny' } if the property is an optional embedded object.",
    );
    this.name = 'RelationNotLoadedError';
  }
}

/**
 * Thrown when a rule condition cannot be expressed by the requested backend, for example a negated
 * relation condition in `FindOptionsWhere`, or a `Raw` operator in an instance check.
 */
export class UnsupportedConditionError extends CaslTypeOrmError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedConditionError';
  }
}
