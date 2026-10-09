import { RELEASE_TAG } from './spec.ts';

const PACKAGE_VERSION = /^\d+\.\d+\.\d+$/;

function parts(version: string): number[] {
  return version.replace(/^v/, '').split('.').map(Number);
}

/** Negative, zero or positive as `a` is older than, equal to or newer than `b`; both are final `[v]X.Y.Z`. */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** The newest final release tag among the given tags, or null when there is none. */
export function newestRelease(tags: string[]): string | null {
  return (
    tags
      .filter((tag) => RELEASE_TAG.test(tag))
      .sort(compareVersions)
      .at(-1) ?? null
  );
}

export interface ReleaseState {
  /** The aio release the run was asked to generate from. */
  aioTag: string;
  /** The package version the run was asked to publish. */
  version: string;
  /** The version package.json records at the commit the run started from. */
  manifestVersion: string;
  /** The aio release the committed pin names, null when it names none. */
  pinTag: string | null;
  /** This repository's tags pointing at the commit the run started from. */
  headTags: string[];
  /** Every version of the package npm already has. */
  published: string[];
  /** Whether the commit the pin names is in the history of `aioTag`, so the release loses nothing the pin had. */
  aioTagContainsPin: boolean;
  /** Whether this repository already has the tag `v<version>`, anywhere. */
  versionTagged: boolean;
}

export type ReleaseDecision = { mode: 'release' } | { mode: 'publish-recorded' } | { mode: 'refuse'; reason: string };

/**
 * What a release run does: generate, record and publish a new version; publish a version an
 * earlier run recorded (committed and tagged) but did not get onto npm; or refuse.
 */
export function decideRelease(state: ReleaseState): ReleaseDecision {
  const refuse = (reason: string): ReleaseDecision => ({ mode: 'refuse', reason });

  if (!RELEASE_TAG.test(state.aioTag)) {
    return refuse(`${state.aioTag} is not a final aio release tag (vX.Y.Z)`);
  }
  if (!PACKAGE_VERSION.test(state.version)) {
    return refuse(`${state.version} is not a final package version (X.Y.Z)`);
  }
  if (state.published.includes(state.version)) {
    return refuse(`@appsolutely/sdk ${state.version} is already on npm`);
  }

  const recorded = state.manifestVersion === state.version && state.headTags.includes(`v${state.version}`);
  if (recorded) {
    return state.pinTag === state.aioTag
      ? { mode: 'publish-recorded' }
      : refuse(`v${state.version} was recorded from aio ${String(state.pinTag)}, not ${state.aioTag}`);
  }

  if (state.versionTagged) {
    return refuse(
      `v${state.version} is already tagged at another commit; publish it from that commit or choose a new version`,
    );
  }
  if (compareVersions(state.version, state.manifestVersion) < 0) {
    return refuse(`${state.version} is older than the recorded ${state.manifestVersion}`);
  }
  const newestPublished = state.published
    .filter((version) => PACKAGE_VERSION.test(version))
    .sort(compareVersions)
    .at(-1);
  if (newestPublished !== undefined && compareVersions(state.version, newestPublished) <= 0) {
    return refuse(`${state.version} is not newer than the published ${newestPublished}`);
  }
  // The pinned tag itself is allowed, so a fix to the client alone can ship without a new aio release.
  if (state.pinTag !== null && compareVersions(state.aioTag, state.pinTag) < 0) {
    return refuse(`aio ${state.aioTag} is older than the pinned ${state.pinTag}`);
  }
  if (!state.aioTagContainsPin) {
    return refuse(`aio ${state.aioTag} does not contain the pinned commit, so its document may lack what the pin has`);
  }
  return { mode: 'release' };
}

/** The versions `npm view <name> versions --json` printed: a string for one version, a list for several. */
export function parsePublishedVersions(output: string): string[] {
  const versions: unknown = JSON.parse(output);
  return Array.isArray(versions) ? versions.map(String) : [String(versions)];
}

export interface WatchVerdict {
  ok: boolean;
  message: string;
}

/**
 * Whether the pin is up to date with aio's releases. A pin at a release is behind any newer release;
 * a pin at an untagged commit is behind only a release that contains that commit, since an older
 * release would lose what the pin has.
 */
export function watchVerdict(
  tags: string[],
  pinTag: string | null,
  containsPin: (tag: string) => boolean,
): WatchVerdict {
  const newest = newestRelease(tags);
  if (newest === null) {
    return { ok: false, message: 'No final aio release tag was listed; the tag listing is probably wrong.' };
  }
  if (pinTag === null && !containsPin(newest)) {
    return {
      ok: true,
      message: `Pinned at an untagged aio commit that no release contains yet; the newest is ${newest}.`,
    };
  }
  if (pinTag === null || compareVersions(newest, pinTag) > 0) {
    return {
      ok: false,
      message: `aio ${newest} is released and this package is pinned at ${pinTag ?? 'an untagged commit'}. Run the Release workflow with aio_tag=${newest}.`,
    };
  }
  return { ok: true, message: `Pinned at aio ${pinTag}, the newest release.` };
}
