// Round-trips the client against a running install, with a Sanctum token for an administrator
// holding articles:read and articles:write. It first checks the install serves every operation the
// pinned document describes, then creates one draft article on that install and edits it:
//
//   APPSOLUTELY_CONTRACT_BASE_URL=https://example.com APPSOLUTELY_CONTRACT_TOKEN=... pnpm test:contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { SPEC_FILE } from '../../scripts/lib/spec.ts';
import { createClient, type Article } from '../../src/index.ts';
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

test('a read answers a typed page of articles', async () => {
  const { data, error, response } = await client.GET('/api/v1/articles', { params: { query: { per_page: 5 } } });

  assert.equal(response.status, 200, JSON.stringify(error));
  assert.ok(data !== undefined);
  const articles: Article[] = typed(data.data);
  assert.ok(Array.isArray(articles));
  assert.equal(typeof data.meta.total, 'number');
  for (const article of articles) {
    assert.equal(typeof article.id, 'number');
    assert.equal(typeof article.title, 'string');
    assert.ok(Array.isArray(article.categories));
  }
});

test('a write is read back through the same client', async () => {
  const title = `SDK contract ${new Date().toISOString()}`;
  const created = await client.POST('/api/v1/articles', {
    body: { title, content: '<p>Written by the SDK contract test.</p>', status: 0 },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.error));
  assert.ok(created.data !== undefined);
  const article: Article = typed(created.data.data);
  assert.equal(article.title, title);

  const path = { id: article.id };
  const renamed = await client.PATCH('/api/v1/articles/{id}', {
    params: { path },
    body: { title: `${title} (edited)` },
  });
  assert.equal(renamed.response.status, 200, JSON.stringify(renamed.error));

  const read = await client.GET('/api/v1/articles/{id}', { params: { path } });
  assert.ok(read.data !== undefined, JSON.stringify(read.error));
  const reread: Article = typed(read.data.data);
  assert.equal(reread.title, `${title} (edited)`);
  assert.equal(reread.status, 0);
});

test('a missing token is refused with the typed error body', async () => {
  const { data, error, response } = await createClient({ baseUrl }).GET('/api/v1/articles');

  assert.equal(data, undefined);
  assert.equal(response.status, 401);
  assert.equal(error?.status, false);
  assert.equal(typeof error?.message, 'string');
});
