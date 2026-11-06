import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateDocument } from '../scripts/lib/validate.ts';
import { SPEC_FILE } from '../scripts/lib/spec.ts';

const minimal = (operation: string) => `openapi: 3.1.0
info: { title: t, version: v1 }
paths:
  /api/v1/things:
    get:
      operationId: listThings
${operation}      responses:
        '200': { description: ok }
`;

test('the pinned document passes the OpenAPI 3.1 schema', async () => {
  assert.deepEqual(await validateDocument(readFileSync(SPEC_FILE, 'utf8')), []);
});

test('a minimal 3.1 document passes', async () => {
  assert.deepEqual(await validateDocument(minimal('')), []);
});

test('an empty parameter list written as a map is refused', async () => {
  const errors = await validateDocument(minimal('      parameters: {}\n'));

  assert.notDeepEqual(errors, []);
});

test('a 3.0 document is refused, since the client is generated from 3.1 semantics', async () => {
  const errors = await validateDocument(minimal('').replace('3.1.0', '3.0.3'));

  assert.deepEqual(errors, ['openapi is 3.0.3; this package generates from OpenAPI 3.1 documents only']);
});

test('a document that is not YAML is refused', async () => {
  const errors = await validateDocument('openapi: [unclosed');

  assert.equal(errors.length, 1);
});
