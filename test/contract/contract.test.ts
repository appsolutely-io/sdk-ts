// Round-trips the client against a running install, with a signed-in member's access token holding
// me:read and me:write. It first checks the install serves every operation the pinned document
// describes, then files one address for that member, edits it and deletes it:
//
//   APPSOLUTELY_CONTRACT_BASE_URL=https://example.com APPSOLUTELY_CONTRACT_TOKEN=... pnpm test:contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { SPEC_FILE } from '../../scripts/lib/spec.ts';
import { createClient, type UserAddress } from '../../src/index.ts';
import type { IsAny } from '../support/types.ts';

const baseUrl = process.env['APPSOLUTELY_CONTRACT_BASE_URL'];
const token = process.env['APPSOLUTELY_CONTRACT_TOKEN'];
if (baseUrl === undefined || token === undefined) {
  throw new Error('Set APPSOLUTELY_CONTRACT_BASE_URL and APPSOLUTELY_CONTRACT_TOKEN to run the contract test.');
}

const client = createClient({ baseUrl, token });

/** The value unchanged; a compile error when its type is `any`, so the checks below run on typed data. */
function typed<T>(value: T, ...notAny: IsAny<T> extends true ? [never] : []): T {
  void notAny;
  return value;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function operations(document: { paths?: Record<string, Record<string, unknown>> }): string[] {
  return Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) => METHODS.includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

test('the install serves every operation the pinned document describes', async () => {
  const { data, error, response } = await client.GET('/api/v1/openapi.json');
  assert.equal(response.status, 200, JSON.stringify(error));

  const served = new Set(operations(data as { paths?: Record<string, Record<string, unknown>> }));
  const missing = operations(parse(readFileSync(SPEC_FILE, 'utf8'))).filter((operation) => !served.has(operation));

  assert.deepEqual(missing, [], 'the install runs an aio older than the pinned document, or a different API');
});

test("a read answers a typed page of the member's addresses", async () => {
  const { data, error, response } = await client.GET('/api/v1/me/addresses', { params: { query: { limit: 5 } } });

  assert.equal(response.status, 200, JSON.stringify(error));
  assert.ok(data !== undefined);
  const addresses: UserAddress[] = typed(data.data);
  assert.ok(Array.isArray(addresses));
  assert.ok(addresses.length <= 5);
  assert.ok(data.next_cursor === undefined || typeof data.next_cursor === 'string');
  for (const address of addresses) {
    assert.equal(typeof address.id, 'string');
    assert.equal(typeof address.name, 'string');
  }
});

test('a write is read back through the same client', async () => {
  const name = `SDK contract ${new Date().toISOString()}`;
  const created = await client.POST('/api/v1/me/addresses', { body: { name, address: '1 Contract Street' } });
  assert.equal(created.response.status, 201, JSON.stringify(created.error));
  assert.ok(created.data !== undefined);
  const address: UserAddress = typed(created.data);
  assert.equal(address.name, name);

  const path = { id: address.id };
  try {
    const moved = await client.PATCH('/api/v1/me/addresses/{id}', { params: { path }, body: { city: 'Leeds' } });
    assert.equal(moved.response.status, 200, JSON.stringify(moved.error));
    assert.ok(moved.data !== undefined);
    const reread: UserAddress = typed(moved.data);
    assert.equal(reread.name, name);
    assert.equal(reread.city, 'Leeds');
  } finally {
    const deleted = await client.DELETE('/api/v1/me/addresses/{id}', { params: { path } });
    assert.equal(deleted.response.status, 204, JSON.stringify(deleted.error));
  }
});

test('a missing token is refused with a typed problem document', async () => {
  const { data, error, response } = await createClient({ baseUrl }).GET('/api/v1/me/addresses');

  assert.equal(data, undefined);
  assert.equal(response.status, 401);
  assert.equal(error?.type, 'https://appsolutely.io/problems/unauthenticated');
  assert.equal(error?.status, 401);
});
