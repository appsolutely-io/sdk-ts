import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { createClient, mockOperations } from '../src/index.ts';
import { mockTransport, type MockAnswer } from '../src/mock.ts';
import { SPEC_FILE } from '../scripts/lib/spec.ts';

let notices: unknown[][] = [];
const originalWarn = console.warn;

beforeEach(() => {
  notices = [];
  console.warn = (...args: unknown[]) => {
    notices.push(args);
  };
});

afterEach(() => {
  console.warn = originalWarn;
});

const unreachable = async (): Promise<Response> => {
  throw new Error('mock mode reached the network');
};

test('a client with no base URL is in mock mode, says so once, and answers from the bundled data', async () => {
  const client = createClient({ fetch: unreachable });

  assert.equal(client.mock, true);
  assert.equal(notices.length, 1);
  assert.match(String(notices[0]?.[0]), /mock mode/);

  const { data, error, response } = await client.GET('/api/v1/me');
  assert.equal(error, undefined);
  assert.equal(response.status, 200);
  assert.equal(data?.email, 'member@example.test');
  assert.equal(notices.length, 1);
});

test('a client created with no options at all is in mock mode', async () => {
  const client = createClient();

  assert.equal(client.mock, true);
  const { data } = await client.GET('/api/v1/products');
  assert.ok((data?.data.length ?? 0) > 0);
});

test('a client with a base URL is not in mock mode and sends its requests', async () => {
  const seen: string[] = [];
  const client = createClient({
    baseUrl: 'https://example.com',
    fetch: async (request) => {
      seen.push(request.url);
      return Response.json({ id: 'x', terms: { accepted: true } });
    },
  });

  assert.equal(client.mock, false);
  assert.equal(notices.length, 0);
  await client.GET('/api/v1/me');
  assert.deepEqual(seen, ['https://example.com/api/v1/me']);
});

test('mock: false turns mock mode off, so a missing base URL is refused', () => {
  assert.throws(() => createClient({ mock: false }), TypeError);
  assert.equal(notices.length, 0);
});

test('mock: true serves mock data even with a base URL, which may carry a path', async () => {
  const client = createClient({ baseUrl: 'https://example.com/platform', mock: true, fetch: unreachable });

  assert.equal(client.mock, true);
  const { data } = await client.GET('/api/v1/client');
  assert.equal(data?.mode, 'test');
});

test('a path parameter matches the template whatever its value', async () => {
  const client = createClient();

  const { data } = await client.GET('/api/v1/products/{id}', { params: { path: { id: 'any-product' } } });
  assert.equal(data?.title, 'Team');
});

test('operations layered over the bundled data replace those operations and keep the rest', async () => {
  const client = createClient({
    mock: {
      operations: {
        'GET /api/v1/me': {
          status: 200,
          body: { ...mockOperations['GET /api/v1/me']?.body!, name: 'Layered Member' },
        },
        'DELETE /api/v1/me/addresses/{id}': { status: 204 },
      },
    },
  });

  const me = await client.GET('/api/v1/me');
  assert.equal(me.data?.name, 'Layered Member');
  assert.equal(me.data?.email, 'member@example.test');

  const products = await client.GET('/api/v1/products');
  assert.ok((products.data?.data.length ?? 0) > 0);

  const removed = await client.DELETE('/api/v1/me/addresses/{id}', { params: { path: { id: 'a' } } });
  assert.equal(removed.response.status, 204);
  assert.equal(removed.data, undefined);
  assert.equal(removed.error, undefined);
});

test('a layered refusal is typed as the problem document in error', async () => {
  const client = createClient({
    mock: {
      operations: {
        'GET /api/v1/me': {
          status: 401,
          body: { type: 'https://appsolutely.io/problems/unauthenticated', title: 'Unauthenticated', status: 401 },
        },
      },
    },
  });

  const { data, error, response } = await client.GET('/api/v1/me');
  assert.equal(data, undefined);
  assert.equal(error?.status, 401);
  assert.equal(response.headers.get('Content-Type'), 'application/problem+json');
});

test('bundled: false serves only the operations given, and answers others with a 501 problem', async () => {
  const client = createClient({
    mock: { bundled: false, operations: { 'GET /api/v1': { status: 200, body: { version: 'v1', status: 'stable' } } } },
  });

  assert.equal((await client.GET('/api/v1')).data?.version, 'v1');
  const missing = await client.GET('/api/v1/me');
  assert.equal(missing.response.status, 501);
  assert.match(JSON.stringify(missing.error), /no answer for GET \/api\/v1\/me/);
});

test('each answer is a fresh copy, so a caller changing one does not change the next', async () => {
  const client = createClient();

  const first = await client.GET('/api/v1/me');
  if (first.data !== undefined) first.data.name = 'changed';
  const second = await client.GET('/api/v1/me');
  assert.equal(second.data?.name, 'Sample Member');
});

test('every bundled answer is a documented operation and matches its response schema', () => {
  type Schema = Record<string, unknown>;
  const document = parse(readFileSync(SPEC_FILE, 'utf8')) as {
    paths: Record<string, Record<string, { responses: Record<string, Schema> }>>;
    components: { responses?: Record<string, Schema> };
  };
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
  addFormats.default(ajv);
  ajv.addSchema(document as object, 'document');

  const escape = (segment: string) => segment.replaceAll('~', '~0').replaceAll('/', '~1');
  const failures: string[] = [];
  for (const [key, answer] of Object.entries(mockOperations)) {
    const [method = '', path = ''] = key.split(' ');
    const status = String(answer?.status);
    const response = document.paths[path]?.[method.toLowerCase()]?.responses[status];
    if (response === undefined) {
      failures.push(`${key}: no documented ${status} answer`);
      continue;
    }
    // A response is either inline or a reference to a shared one under components.
    const at =
      typeof response.$ref === 'string'
        ? response.$ref.slice(1)
        : `/paths/${escape(path)}/${method.toLowerCase()}/responses/${status}`;
    const validate = ajv.compile({ $ref: `document#${at}/content/application~1json/schema` });
    if (!validate(answer?.body)) {
      failures.push(`${key}: ${ajv.errorsText(validate.errors)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the bundled sample data names only example.test addresses', () => {
  const text = JSON.stringify(mockOperations);
  const addresses = text.match(/[\w.+-]+@[\w.-]+/g) ?? [];
  assert.ok(addresses.length > 0);
  assert.deepEqual(
    addresses.filter((address) => !address.endsWith('@example.test')),
    [],
  );
});

test('a baseUrl key holding undefined is refused rather than read as mock mode', () => {
  const unset: string | undefined = undefined;
  assert.throws(() => createClient({ baseUrl: unset }), /baseUrl is undefined/);
  assert.equal(notices.length, 0);
});

test('a baseUrl key holding undefined is accepted when mock mode is asked for', () => {
  const unset: string | undefined = undefined;
  assert.equal(createClient({ baseUrl: unset, mock: true }).mock, true);
  assert.equal(createClient({ baseUrl: unset, mock: {} }).mock, true);
});

test('an empty baseUrl is refused, with or without mock mode', () => {
  assert.throws(() => createClient({ baseUrl: '' }), TypeError);
  assert.throws(() => createClient({ baseUrl: '', mock: true }), TypeError);
});

test('an answer whose status is not a usable HTTP status is refused when the client is created', () => {
  assert.throws(() => createClient({ mock: { operations: { 'GET /api/v1': { status: 99 } } } }), /status 99/);
  assert.throws(() => createClient({ mock: { operations: { 'GET /api/v1': { status: 200.5 } } } }), /status 200.5/);
});

test('a 204, 205 or 304 answer carrying a body is refused when the client is created', () => {
  for (const status of [204, 205, 304]) {
    assert.throws(
      () =>
        createClient({
          mock: {
            operations: {
              'DELETE /api/v1/me/addresses/{id}': {
                status,
                body: { type: 'https://appsolutely.io/problems/not-found', title: 'Not Found', status },
              },
            },
          },
        }),
      /cannot carry a body/,
    );
  }
});

test('the bundled answers cannot be changed through the export', () => {
  const me = mockOperations['GET /api/v1/me']?.body as { email?: string | null };
  assert.throws(() => {
    me.email = 'changed@example.test';
  }, TypeError);
});

test('a literal segment is matched before a parameter in the same place, whatever the order given', async () => {
  const answers: Record<string, MockAnswer> = {
    'GET /a/{id}/items': { status: 200, body: { route: 'parameter' } },
    'GET /a/current/{item}': { status: 200, body: { route: 'literal' } },
  };
  const transport = mockTransport(answers, 'https://mock.invalid');

  const response = await transport(new Request('https://mock.invalid/a/current/items'));
  assert.deepEqual(await response.json(), { route: 'literal' });
  const other = await transport(new Request('https://mock.invalid/a/other/items'));
  assert.deepEqual(await other.json(), { route: 'parameter' });
});

test('a layered body is typed by the operation it answers', () => {
  // @ts-expect-error -- `nope` is not a field of anything the operation answers.
  const client = createClient({ mock: { operations: { 'GET /api/v1/me': { status: 200, body: { nope: 1 } } } } });
  assert.equal(client.mock, true);
});
