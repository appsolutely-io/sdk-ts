import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generatedDrift } from '../scripts/lib/generate.ts';
import { spawnSync } from 'node:child_process';
import { RELEASE_TAG, SPEC_FILE, aioRepository, pinMismatch, readPin } from '../scripts/lib/spec.ts';

test('the committed document is the one the pin records', () => {
  assert.equal(pinMismatch(readPin(), readFileSync(SPEC_FILE, 'utf8')), null);
});

test('the pin names a full commit and, when it has one, a final release tag', () => {
  const pin = readPin();

  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  assert.ok(pin.tag === null || RELEASE_TAG.test(pin.tag), `unexpected tag ${String(pin.tag)}`);
});

test('the committed client types are what the committed document generates', async () => {
  assert.equal(await generatedDrift(readFileSync(SPEC_FILE, 'utf8')), null);
});

test('the aio repository comes from AIO_REPOSITORY, as owner/name', () => {
  assert.equal(aioRepository({ AIO_REPOSITORY: ' example/aio ' }), 'example/aio');
});

test('an unset or malformed AIO_REPOSITORY is refused with what to set', () => {
  assert.throws(() => aioRepository({}), /AIO_REPOSITORY/);
  assert.throws(() => aioRepository({ AIO_REPOSITORY: 'aio' }), /owner\/name/);
  assert.throws(() => aioRepository({ AIO_REPOSITORY: 'a/b/c' }), /owner\/name/);
});

test('no tracked file names the organisation the aio repository is kept in', () => {
  const organisation = ['appsolutely', 'io'].join('');
  // A hook can export git's own variables; drop them so the search reads this checkout.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const search = spawnSync('git', ['grep', '-l', '-i', '-F', organisation], { encoding: 'utf8', env });

  assert.equal(search.status, 1, `named in: ${search.stdout.trim()}`);
});
