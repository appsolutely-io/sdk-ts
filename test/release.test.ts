import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareVersions,
  decideRelease,
  newestRelease,
  parsePublishedVersions,
  watchVerdict,
  type ReleaseState,
} from '../scripts/lib/release.ts';

test('versions compare numerically, not as text', () => {
  assert.ok(compareVersions('v0.10.0', 'v0.9.9') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.0') === 0);
  assert.ok(compareVersions('0.1.0', '0.1.1') < 0);
});

test('the newest final release ignores pre-releases and anything that is not a version tag', () => {
  assert.equal(newestRelease(['v0.9.0', 'v0.10.0', 'v0.11.0-rc.1', 'nightly', 'v0.2.0']), 'v0.10.0');
  assert.equal(newestRelease(['nightly']), null);
});

const state = (overrides: Partial<ReleaseState>): ReleaseState => ({
  aioTag: 'v0.7.0',
  version: '0.2.0',
  manifestVersion: '0.1.0',
  pinTag: 'v0.6.0',
  headTags: [],
  published: ['0.1.0'],
  aioTagContainsPin: true,
  versionTagged: false,
  ...overrides,
});

test('a newer aio release with a higher package version is released', () => {
  assert.deepEqual(decideRelease(state({})), { mode: 'release' });
});

test('the first release publishes the version the manifest already holds, from an untagged pin', () => {
  assert.deepEqual(decideRelease(state({ version: '0.1.0', pinTag: null, published: [] })), { mode: 'release' });
});

test('a run that recorded its release but did not publish it publishes the recorded commit', () => {
  const recorded = state({ manifestVersion: '0.2.0', pinTag: 'v0.7.0', headTags: ['v0.2.0'] });

  assert.deepEqual(decideRelease(recorded), { mode: 'publish-recorded' });
});

test('a version npm already has is refused, recorded or not', () => {
  const published = ['0.1.0', '0.2.0'];

  assert.equal(decideRelease(state({ published })).mode, 'refuse');
  assert.equal(
    decideRelease(state({ manifestVersion: '0.2.0', pinTag: 'v0.7.0', headTags: ['v0.2.0'], published })).mode,
    'refuse',
  );
});

test('a version already tagged at another commit is refused, not regenerated', () => {
  const movedOn = state({ aioTag: 'v0.6.0', version: '0.1.5', manifestVersion: '0.1.5', versionTagged: true });

  assert.match(JSON.stringify(decideRelease(movedOn)), /already tagged/);
});

test('an aio tag older than the pin is refused', () => {
  assert.equal(decideRelease(state({ aioTag: 'v0.5.0' })).mode, 'refuse');
});

test('the pinned aio tag again releases a fix to the client alone', () => {
  assert.deepEqual(decideRelease(state({ aioTag: 'v0.6.0' })), { mode: 'release' });
});

test('an aio release that does not contain the pinned commit is refused, so a release never loses document fixes', () => {
  assert.equal(decideRelease(state({ pinTag: null, aioTagContainsPin: false })).mode, 'refuse');
});

test('a package version that does not move forward is refused', () => {
  assert.equal(decideRelease(state({ version: '0.0.9' })).mode, 'refuse');
  assert.equal(
    decideRelease(state({ version: '0.1.5', manifestVersion: '0.1.0', published: ['0.1.0', '0.2.0'] })).mode,
    'refuse',
  );
});

test('inputs that are not a final aio tag and a final package version are refused', () => {
  assert.equal(decideRelease(state({ aioTag: 'v0.7.0-rc.1' })).mode, 'refuse');
  assert.equal(decideRelease(state({ aioTag: '0.7.0' })).mode, 'refuse');
  assert.equal(decideRelease(state({ version: 'v0.2.0' })).mode, 'refuse');
  assert.equal(decideRelease(state({ version: '0.2.0-beta.1' })).mode, 'refuse');
});

test('a recorded version whose pin names a different aio release is refused rather than published', () => {
  const mismatched = state({ manifestVersion: '0.2.0', pinTag: 'v0.6.0', headTags: ['v0.2.0'] });

  assert.equal(decideRelease(mismatched).mode, 'refuse');
});

test('npm view output reads as a list whether npm printed one version or several', () => {
  assert.deepEqual(parsePublishedVersions('"0.1.0"'), ['0.1.0']);
  assert.deepEqual(parsePublishedVersions('["0.1.0","0.2.0"]'), ['0.1.0', '0.2.0']);
});

test('the watch is red only for a release the pin is behind', () => {
  const never = () => false;
  const always = () => true;

  assert.equal(watchVerdict([], 'v0.6.0', never).ok, false);
  assert.equal(watchVerdict(['v0.6.0', 'v0.7.0'], 'v0.6.0', never).ok, false);
  assert.equal(watchVerdict(['v0.6.0', 'v0.7.0-rc.1'], 'v0.6.0', never).ok, true);
  assert.equal(watchVerdict(['v0.6.0'], null, never).ok, true);
  assert.equal(watchVerdict(['v0.6.0'], null, always).ok, false);
});
