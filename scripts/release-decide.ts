// Decides what a release run does and writes it to $GITHUB_OUTPUT as mode=release|publish-recorded;
// refuses, exiting non-zero with the reason, otherwise. --aio is a checkout of aio with its history.
//   pnpm release:decide --aio .aio --aio-tag v0.7.0 --version 0.2.0
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { decideRelease, parsePublishedVersions } from './lib/release.ts';
import { readManifest, readPin } from './lib/spec.ts';

const { values } = parseArgs({
  options: { aio: { type: 'string' }, 'aio-tag': { type: 'string' }, version: { type: 'string' } },
});
const aio = values.aio;
const aioTag = values['aio-tag'];
const version = values.version;
if (aio === undefined || aioTag === undefined || version === undefined) {
  throw new Error('Usage: pnpm release:decide --aio <aio checkout> --aio-tag vX.Y.Z --version X.Y.Z');
}

const manifest = readManifest();

function publishedVersions(): string[] {
  try {
    return parsePublishedVersions(
      execFileSync('npm', ['view', manifest.name, 'versions', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch (error) {
    // A package npm has never seen answers E404; any other failure must not read as "nothing published".
    if (String((error as { stderr?: unknown }).stderr).includes('E404')) {
      return [];
    }
    throw error;
  }
}

function tagContains(checkout: string, commit: string): boolean {
  try {
    execFileSync('git', ['-C', checkout, 'merge-base', '--is-ancestor', commit, `refs/tags/${aioTag}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    // Not an ancestor, or a commit the release's history does not have at all.
    return false;
  }
}

const decision = decideRelease({
  aioTag,
  version,
  manifestVersion: manifest.version,
  pinTag: readPin().tag,
  headTags: execFileSync('git', ['tag', '--points-at', 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean),
  published: publishedVersions(),
  aioTagContainsPin: tagContains(aio, readPin().commit),
  versionTagged: execFileSync('git', ['tag', '--list', `v${version}`], { encoding: 'utf8' }).trim() !== '',
});

if (decision.mode === 'refuse') {
  console.error(`Refusing to release: ${decision.reason}.`);
  process.exit(1);
}
console.log(`Release mode: ${decision.mode}.`);
if (process.env['GITHUB_OUTPUT'] !== undefined) {
  appendFileSync(process.env['GITHUB_OUTPUT'], `mode=${decision.mode}\n`);
}
