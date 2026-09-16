/** Base class of every error thrown by this package. */
export class CaslTypeOrmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaslTypeOrmError';
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
