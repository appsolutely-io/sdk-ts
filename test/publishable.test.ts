import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinProblems } from '../scripts/lib/publishable.ts';
import { sha256, type SpecPin } from '../scripts/lib/spec.ts';

const document = 'openapi: 3.1.0\n';
const pin = (overrides: Partial<SpecPin>): SpecPin => ({
  path: 'docs/api/openapi.yaml',
  tag: 'v1.2.3',
  commit: 'a'.repeat(40),
  sha256: sha256(document),
  ...overrides,
});

test('a document pinned at a final aio release is publishable', () => {
  assert.deepEqual(pinProblems(pin({}), document), []);
});

test('a document pinned at a commit no release points at is not', () => {
  assert.match(pinProblems(pin({ tag: null }), document).join('\n'), /release tag/);
});

test('a pre-release tag is not a release a client can name', () => {
  assert.match(pinProblems(pin({ tag: 'v1.3.0-rc.1' }), document).join('\n'), /release tag/);
});

test('a document that is not the pinned one is not publishable', () => {
  assert.match(pinProblems(pin({}), 'openapi: 3.1.1\n').join('\n'), /not the document/);
});
