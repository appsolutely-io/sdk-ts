import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { resolvePin } from '../scripts/lib/pin.ts';
import { AIO_DEFAULT_BRANCH, AIO_SPEC_PATH, sha256 } from '../scripts/lib/spec.ts';

let checkout = '';
let released = '';
let candidate = '';
let unmerged = '';

function git(...args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
}

function commitDocument(text: string): string {
  writeFileSync(join(checkout, AIO_SPEC_PATH), text);
  git('add', AIO_SPEC_PATH);
  git(
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@example.com',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-q',
    '-m',
    'doc',
  );
  return git('rev-parse', 'HEAD');
}

before(() => {
  checkout = mkdtempSync(join(tmpdir(), 'sdk-pin-'));
  git('init', '-q');
  mkdirSync(join(checkout, dirname(AIO_SPEC_PATH)), { recursive: true });
  released = commitDocument('openapi: 3.1.0\n# released\n');
  git('tag', 'v1.2.3');
  candidate = commitDocument('openapi: 3.1.0\n# candidate\n');
  git('tag', 'v1.3.0-rc.1');
  git('update-ref', `refs/remotes/origin/${AIO_DEFAULT_BRANCH}`, candidate);
  git('checkout', '-q', '-b', 'feature');
  unmerged = commitDocument('openapi: 3.1.0\n# unmerged\n');
});

after(() => rmSync(checkout, { recursive: true, force: true }));

test('a release tag pins that release and records the tag', () => {
  const pin = resolvePin(checkout, 'v1.2.3');

  assert.equal(pin.tag, 'v1.2.3');
  assert.equal(pin.commit, released);
  assert.equal(pin.document, 'openapi: 3.1.0\n# released\n');
  assert.equal(pin.sha256, sha256('openapi: 3.1.0\n# released\n'));
});

test('a commit that a release tag points at records that tag', () => {
  assert.equal(resolvePin(checkout, released).tag, 'v1.2.3');
});

test('a commit no final release points at records no tag', () => {
  const pin = resolvePin(checkout, candidate);

  assert.equal(pin.tag, null);
  assert.equal(pin.commit, candidate);
});

test('a pre-release tag is not recorded as the release a client matches', () => {
  assert.equal(resolvePin(checkout, 'v1.3.0-rc.1').tag, null);
});

test('a commit carrying several release tags records the newest, compared as versions', () => {
  git('tag', 'v1.10.0', released);
  git('tag', 'v1.1.0', released);
  try {
    assert.equal(resolvePin(checkout, released).tag, 'v1.10.0');
  } finally {
    git('tag', '-d', 'v1.10.0', 'v1.1.0');
  }
});

test('a pre-release ref does not hide a final release on the same commit', () => {
  git('tag', 'v1.3.0', candidate);
  try {
    assert.equal(resolvePin(checkout, 'v1.3.0-rc.1').tag, 'v1.3.0');
  } finally {
    git('tag', '-d', 'v1.3.0');
  }
});

test('an unknown ref is refused', () => {
  assert.throws(() => resolvePin(checkout, 'v9.9.9'), /v9\.9\.9/);
});

test('a commit only another branch has is refused, since no release may ever contain it', () => {
  assert.throws(() => resolvePin(checkout, unmerged), /not on aio's default branch/);
});

test('a commit is refused when the checkout cannot show the default branch', () => {
  git('update-ref', '-d', `refs/remotes/origin/${AIO_DEFAULT_BRANCH}`);
  try {
    assert.throws(() => resolvePin(checkout, candidate), /not on aio's default branch/);
  } finally {
    git('update-ref', `refs/remotes/origin/${AIO_DEFAULT_BRANCH}`, candidate);
  }
});

test('a release tag pins even when its commit is not on the default branch', () => {
  git('tag', 'v1.4.0', unmerged);
  try {
    assert.equal(resolvePin(checkout, 'v1.4.0').commit, unmerged);
  } finally {
    git('tag', '-d', 'v1.4.0');
  }
});
