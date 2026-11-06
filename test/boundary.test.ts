import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { matchesBoundary, scanPaths } from '../scripts/lib/boundary.ts';
import { GENERATED_FILE, SPEC_FILE } from '../scripts/lib/spec.ts';

const rules = ['violet', 'exampleorg secretkit'].map((value) => ({
  length: value.length,
  sha256: createHash('sha256').update(value).digest('hex'),
}));

test('the digest matcher catches substrings in every case and qualified combinations', () => {
  for (const line of ['violet_id', 'Violet', 'X-VIOLET', 'violets', 'XMLVioletResolver', 'exampleorg/secretkit']) {
    assert.ok(matchesBoundary(line, rules), line);
  }
  for (const line of ['', 'a maintenance window', 'exampleorg/publickit', 'viole']) {
    assert.ok(!matchesBoundary(line, rules), line);
  }
});

test('the default rules retain case-insensitive substring enforcement', () => {
  for (const encoded of ['dGVuYW50', 'dGVuYW5jeQ==']) {
    const value = Buffer.from(encoded, 'base64').toString('utf8');
    for (const line of [value, value.toUpperCase(), `X-${value}`, `${value}s`, `XML${value}Resolver`]) {
      assert.ok(matchesBoundary(line));
    }
  }
  assert.ok(!matchesBoundary('a maintenance window'));
});

test('a scan names the file and line of each placeholder hit, in nested directories too', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-boundary-'));
  try {
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested', 'a.d.ts'), 'export type A = string;\nexport type VioletId = string;\n');
    writeFileSync(join(root, 'b.js'), 'export {};\n');

    assert.deepEqual(scanPaths([root], rules), [`${join(root, 'nested', 'a.d.ts')}:2: export type VioletId = string;`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the pinned document and the client generated from it are clean', () => {
  assert.deepEqual(scanPaths([SPEC_FILE, GENERATED_FILE]), []);
});
