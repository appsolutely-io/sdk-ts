import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BOUNDARY_PATTERN, scanPaths } from '../scripts/lib/boundary.ts';
import { GENERATED_FILE, SPEC_FILE } from '../scripts/lib/spec.ts';

test('the pattern catches every spelling a published client must not carry', () => {
  for (const line of ['tenant_id', 'Tenancy', 'X-TENANT', 'tenants']) {
    assert.ok(BOUNDARY_PATTERN.test(line), line);
  }
  assert.ok(!BOUNDARY_PATTERN.test('a maintenance window'));
});

test('a scan names the file and line of each hit, in nested directories too', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-boundary-'));
  try {
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested', 'a.d.ts'), 'export type A = string;\nexport type TenantId = string;\n');
    writeFileSync(join(root, 'b.js'), 'export {};\n');

    assert.deepEqual(scanPaths([root]), [`${join(root, 'nested', 'a.d.ts')}:2: export type TenantId = string;`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the pinned document and the client generated from it are clean', () => {
  assert.deepEqual(scanPaths([SPEC_FILE, GENERATED_FILE]), []);
});
