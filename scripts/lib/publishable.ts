import { PIN_COMMAND, RELEASE_TAG, pinMismatch, type SpecPin } from './spec.ts';

/** Why the pin cannot be published: a released client names the final aio release it was generated from. */
export function pinProblems(pin: SpecPin, document: string): string[] {
  const problems: string[] = [];
  if (pin.tag === null || !RELEASE_TAG.test(pin.tag)) {
    problems.push(
      `The spec pin (aio ${pin.commit}) has no final aio release tag; repin at one with ${PIN_COMMAND} before publishing.`,
    );
  }
  const mismatch = pinMismatch(pin, document);
  if (mismatch !== null) {
    problems.push(mismatch);
  }
  return problems;
}
