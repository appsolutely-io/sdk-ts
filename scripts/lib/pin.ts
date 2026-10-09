import { execFileSync } from 'node:child_process';
import { newestRelease } from './release.ts';
import { AIO_DEFAULT_BRANCH, AIO_SPEC_PATH, RELEASE_TAG, sha256 } from './spec.ts';

export interface ResolvedPin {
  tag: string | null;
  commit: string;
  sha256: string;
  document: string;
}

function git(checkout: string, args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function onDefaultBranch(checkout: string, commit: string): boolean {
  try {
    git(checkout, ['merge-base', '--is-ancestor', commit, `refs/remotes/origin/${AIO_DEFAULT_BRANCH}`]);
    return true;
  } catch {
    // Not an ancestor, or a checkout that does not have the default branch to tell.
    return false;
  }
}

/** The aio document at `ref` in a local aio checkout, with the final release tag that points at it, if any. */
export function resolvePin(checkout: string, ref: string): ResolvedPin {
  let commit: string;
  try {
    commit = git(checkout, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`${ref} is not a commit or tag in ${checkout}`);
  }

  const document = git(checkout, ['show', `${commit}:${AIO_SPEC_PATH}`]);
  const tags = git(checkout, ['tag', '--points-at', commit]).split('\n');
  // A final release named as the ref is the one recorded, even when a newer one shares the commit.
  const tag = newestRelease(RELEASE_TAG.test(ref) && tags.includes(ref) ? [ref] : tags);
  if (tag === null && !onDefaultBranch(checkout, commit)) {
    // A commit only a feature branch has never reaches a release when that branch is squashed or
    // rebased, and a release has to contain the pinned commit, so the pin could never be released.
    throw new Error(
      `${ref} is not on aio's default branch (origin/${AIO_DEFAULT_BRANCH} in ${checkout}); pin a release tag or a commit on it`,
    );
  }

  return { tag, commit, sha256: sha256(document), document };
}
