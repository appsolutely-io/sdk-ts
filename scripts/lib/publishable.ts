import { PIN_COMMAND, RELEASE_TAG, pinMismatch, type SpecPin } from './spec.ts';

/** A semver pre-release such as `0.1.0-next.0`, published under a dist-tag other than `latest`. */
const PRERELEASE_VERSION = /^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/;

/**
 * Why the pin cannot be published. A final package version names the final aio release it was
 * generated from; a pre-release may pin a commit on aio's default branch, since the pin tool only
 * accepts such a commit and aio may have no release that contains it yet.
 */
export function pinProblems(pin: SpecPin, document: string, version: string): string[] {
  const problems: string[] = [];
  const released = pin.tag !== null && RELEASE_TAG.test(pin.tag);
  if (!released && !PRERELEASE_VERSION.test(version)) {
    problems.push(
      `The spec pin (aio ${pin.commit}) has no final aio release tag; repin at one with ${PIN_COMMAND} before publishing ${version}.`,
    );
  }
  const mismatch = pinMismatch(pin, document);
  if (mismatch !== null) {
    problems.push(mismatch);
  }
  return problems;
}
