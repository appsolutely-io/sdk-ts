import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  resolveRef,
  type OpenAPI3,
  type OperationObject,
  type ParameterObject,
  type PathItemObject,
  type ReferenceObject,
} from 'openapi-typescript';
import { parse } from 'yaml';
import { createClient } from '../src/index.ts';

function resolve<T>(document: OpenAPI3, value: T | ReferenceObject): T {
  if (value !== null && typeof value === 'object' && '$ref' in value && typeof value.$ref === 'string') {
    const resolved = resolveRef<T>(document, value.$ref, { silent: false });
    assert.ok(resolved !== undefined, `Cannot resolve ${value.$ref}`);
    return resolved;
  }
  return value as T;
}

interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function recordingFetch(status = 200, body: unknown = { data: [] }, contentType = 'application/json') {
  const calls: Recorded[] = [];
  const fetch = async (input: Request): Promise<Response> => {
    calls.push({ url: input.url, method: input.method, headers: input.headers, body: await input.text() });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
  };
  return { calls, fetch };
}

test('every operation in the document is keyed exactly when its header is required', async () => {
  const document: OpenAPI3 = parse(readFileSync(new URL('../spec/openapi.yaml', import.meta.url), 'utf8'));
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.test', fetch });
  const request = client.request as (
    method: string,
    path: string,
    init: { params: { path: Record<string, string> } },
  ) => Promise<unknown>;
  let keyed = 0;
  for (const [path, raw] of Object.entries(document.paths ?? {})) {
    const item = resolve<PathItemObject>(document, raw);
    for (const method of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const) {
      const rawOperation = item[method];
      if (rawOperation === undefined) continue;
      const operation = resolve<OperationObject>(document, rawOperation);
      const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])];
      const header = parameters
        .map((parameter) =>
          '$ref' in parameter ? resolveRef<ParameterObject>(document, parameter.$ref, { silent: false }) : parameter,
        )
        .reverse()
        .find((parameter) => parameter?.in === 'header' && parameter.name === 'Idempotency-Key');
      const expected = header?.required === true;
      const pathParams = Object.fromEntries(
        Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => [match[1], 'example']),
      );
      await request(method, path, { params: { path: pathParams } });
      const actual = calls.at(-1)?.headers.get('Idempotency-Key');
      assert.equal(actual != null, expected, `${method.toUpperCase()} ${path}`);
      if (expected) {
        assert.match(actual ?? '', /^[0-9a-f-]{36}$/);
        keyed++;
      }
    }
  }
  assert.ok(keyed > 0);
});

test('a request carries the token as a bearer credential and asks for JSON', async () => {
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.com', token: '1|secret', fetch });

  await client.GET('/api/v1/products', { params: { query: { limit: 5 } } });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://example.com/api/v1/products?limit=5');
  assert.equal(calls[0]?.headers.get('Authorization'), 'Bearer 1|secret');
  assert.equal(calls[0]?.headers.get('Accept'), 'application/json');
});

test('a base URL with a trailing slash or a path prefix still reaches the route', async () => {
  const { calls, fetch } = recordingFetch();

  await createClient({ baseUrl: 'https://example.com/', fetch }).GET('/api/v1');
  await createClient({ baseUrl: 'https://example.com/install', fetch }).GET('/api/v1');

  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://example.com/api/v1', 'https://example.com/install/api/v1'],
  );
});

test('without a token no credential is sent, for the routes that need none', async () => {
  const { calls, fetch } = recordingFetch();

  await createClient({ baseUrl: 'https://example.com', fetch }).GET('/api/v1');

  assert.equal(calls[0]?.headers.has('Authorization'), false);
});

test('path parameters and JSON bodies are encoded from the typed arguments', async () => {
  const { calls, fetch } = recordingFetch(200, { id: '42', city: 'Leeds' });
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  await client.PATCH('/api/v1/me/addresses/{id}', { params: { path: { id: '42' } }, body: { city: 'Leeds' } });

  assert.equal(calls[0]?.method, 'PATCH');
  assert.equal(calls[0]?.url, 'https://example.com/api/v1/me/addresses/42');
  assert.equal(calls[0]?.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0]?.body ?? ''), { city: 'Leeds' });
});

test('a refusal comes back as the typed problem document, not a thrown exception', async () => {
  const refusal = {
    type: 'https://appsolutely.io/problems/unauthenticated',
    title: 'Unauthenticated',
    status: 401,
    detail: 'No bearer token was sent.',
  };
  const { fetch } = recordingFetch(401, refusal, 'application/problem+json');

  const { data, error, response } = await createClient({ baseUrl: 'https://example.com', fetch }).GET(
    '/api/v1/products',
  );

  assert.equal(data, undefined);
  assert.equal(response.status, 401);
  assert.deepEqual(error, refusal);
  assert.equal(error?.type === 'https://appsolutely.io/problems/unauthenticated', true);
});

test('a validation problem carries the refused fields under errors', async () => {
  const refusal = {
    type: 'https://appsolutely.io/problems/validation-failed',
    title: 'Validation failed',
    status: 422,
    errors: { name: ['The name field is required.'] },
  };
  const { fetch } = recordingFetch(422, refusal, 'application/problem+json');

  const { error } = await createClient({ baseUrl: 'https://example.com', token: 't', fetch }).POST(
    '/api/v1/me/addresses',
    { body: { name: '', address: '1 Main St' } },
  );

  if (error?.type !== 'https://appsolutely.io/problems/validation-failed' || !('errors' in error)) {
    assert.fail(`expected a validation problem, got ${JSON.stringify(error)}`);
  }
  assert.deepEqual(error.errors, { name: ['The name field is required.'] });
});

test('a list page is the records and the next cursor, which asks for the next page', async () => {
  const { calls, fetch } = recordingFetch(200, { data: [{ id: '1' }], next_cursor: 'c2' });
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  const first = await client.GET('/api/v1/products', { params: { query: { limit: 1 } } });
  const cursor = first.data?.next_cursor;
  assert.equal(cursor, 'c2');
  await client.GET('/api/v1/products', {
    params: { query: { limit: 1, ...(cursor === undefined ? {} : { cursor }) } },
  });

  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://example.com/api/v1/products?limit=1', 'https://example.com/api/v1/products?limit=1&cursor=c2'],
  );
});

test('an answer with no body, 204 or an empty 202, resolves with no data and no error', async () => {
  for (const status of [202, 204]) {
    const fetch = async () => new Response(null, { status });
    const { data, error, response } = await createClient({ baseUrl: 'https://example.com', token: 't', fetch }).DELETE(
      '/api/v1/me/addresses/{id}',
      { params: { path: { id: '7' } } },
    );

    assert.equal(response.status, status);
    assert.equal(data, undefined);
    assert.equal(error, undefined);
  }
});

test('a keyed create is sent a generated Idempotency-Key, a new one per call', async () => {
  const { calls, fetch } = recordingFetch(200, { token: 'tok', status: 'delivered' });
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  await client.POST('/api/v1/fulfilments', { body: { token: 'tok', delivery_payload: 'LICENCE-1' } });
  await client.POST('/api/v1/fulfilments', { body: { token: 'tok', delivery_payload: 'LICENCE-1' } });

  const keys = calls.map((call) => call.headers.get('Idempotency-Key'));
  assert.match(keys[0] ?? '', /^[0-9a-f-]{36}$/);
  assert.match(keys[1] ?? '', /^[0-9a-f-]{36}$/);
  assert.notEqual(keys[0], keys[1]);
});

test('a purchase and a subscription change are sent a generated Idempotency-Key', async () => {
  const { calls, fetch } = recordingFetch(201, { id: '1' });
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  await client.POST('/api/v1/me/checkout-sessions', {
    body: {
      lines: [{ product: 'pro', quantity: 1 }],
      success_url: 'https://app.example/ok',
      cancel_url: 'https://app.example/no',
    },
  });
  await client.POST('/api/v1/me/subscriptions/{subscription}/changes', {
    params: { path: { subscription: '0f6c1c36-0d3a-4e8e-9a4b-3f1f2a0b5c6d' } },
    body: { sku: 'team', return_url: 'https://app.example/billing' },
  });

  for (const call of calls) {
    assert.match(call.headers.get('Idempotency-Key') ?? '', /^[0-9a-f-]{36}$/);
  }
  assert.equal(calls.length, 2);
});

test('an Idempotency-Key the caller passes is sent as given', async () => {
  const { calls, fetch } = recordingFetch(202, { id: '1' });
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  await client.POST('/api/v1/deliveries/{event}/redeliveries', {
    params: { path: { event: '9' }, header: { 'Idempotency-Key': 'caller-key' } },
  });

  assert.equal(calls[0]?.headers.get('Idempotency-Key'), 'caller-key');
});

test('a fetch that retries the request repeats its Idempotency-Key', async () => {
  const keys: (string | null)[] = [];
  const fetch = async (request: Request): Promise<Response> => {
    for (const attempt of [request.clone(), request]) {
      keys.push(attempt.headers.get('Idempotency-Key'));
    }
    return Response.json({ token: 'tok', status: 'delivered' }, { status: 200 });
  };

  await createClient({ baseUrl: 'https://example.com', token: 't', fetch }).POST('/api/v1/fulfilments', {
    body: { token: 'tok', delivery_payload: 'LICENCE-1' },
  });

  assert.equal(keys.length, 2);
  assert.ok(keys[0] !== null);
  assert.equal(keys[0], keys[1]);
});

test('a request the document does not key is sent no Idempotency-Key', async () => {
  const { calls, fetch } = recordingFetch(202, null);
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  await client.POST('/api/v1/auth/magic-link', {
    body: { email: 'a@example.com', abilities: ['me:read'], device_name: 'd', code_challenge: 'c' },
  });
  await client.PATCH('/api/v1/me/addresses/{id}', { params: { path: { id: '1' } }, body: { city: 'Leeds' } });

  assert.deepEqual(
    calls.map((call) => call.headers.has('Idempotency-Key')),
    [false, false],
  );
});

test('headers the caller adds are kept beside the credential', async () => {
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch, headers: { 'X-Request-Id': 'r1' } });

  await client.GET('/api/v1');

  assert.equal(calls[0]?.headers.get('X-Request-Id'), 'r1');
  assert.equal(calls[0]?.headers.get('Authorization'), 'Bearer t');
});

test('headers given as a Headers instance or as pairs are kept too', async () => {
  const { calls, fetch } = recordingFetch();

  await createClient({ baseUrl: 'https://example.com', fetch, headers: new Headers({ 'X-A': '1' }) }).GET('/api/v1');
  await createClient({ baseUrl: 'https://example.com', fetch, headers: [['X-B', '2']] }).GET('/api/v1');

  assert.equal(calls[0]?.headers.get('X-A'), '1');
  assert.equal(calls[1]?.headers.get('X-B'), '2');
  assert.equal(calls[1]?.headers.get('Accept'), 'application/json');
});

test('the credential survives a fetch polyfill replacing Headers after the client is made', async () => {
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });
  const original = globalThis.Headers;
  globalThis.Headers = class extends original {} as typeof Headers;
  try {
    await client.GET('/api/v1');
  } finally {
    globalThis.Headers = original;
  }

  assert.equal(calls[0]?.headers.get('Authorization'), 'Bearer t');
});

test('a caller may ask for another representation, but the token always wins over a caller credential', async () => {
  const { calls, fetch } = recordingFetch();
  const headers = { accept: 'application/problem+json', authorization: 'Basic x' };

  await createClient({ baseUrl: 'https://example.com', token: 't', fetch, headers }).GET('/api/v1');

  assert.equal(calls[0]?.headers.get('Accept'), 'application/problem+json');
  assert.equal(calls[0]?.headers.get('Authorization'), 'Bearer t');
});

test('a base URL that is not an absolute http(s) URL, or carries a query or fragment, is refused at construction', () => {
  for (const baseUrl of [
    '',
    'example.com',
    '/relative',
    'ftp://example.com',
    'https://x.test/?k=1',
    'https://x.test/#h',
    'https://x.test?',
    'https://x.test#',
  ]) {
    assert.throws(() => createClient({ baseUrl }), /baseUrl/, baseUrl);
  }
});

test('a token that is empty or not a single run of visible ASCII is refused at construction, not sent', () => {
  for (const token of ['', '   ', 'a\nb', 'a b', 'a\u0000b', 'tökén']) {
    assert.throws(() => createClient({ baseUrl: 'https://example.com', token }), /token/, JSON.stringify(token));
  }
});

test('a path parameter that is empty, "." or ".." is refused, since the URL would resolve to another route', async () => {
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.com', token: '1|secret', fetch });

  for (const id of ['', '.', '..']) {
    await assert.rejects(client.PATCH('/api/v1/me/addresses/{id}', { params: { path: { id } }, body: {} }), TypeError);
  }
  await client.PATCH('/api/v1/me/addresses/{id}', { params: { path: { id: '...' } }, body: {} });

  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://example.com/api/v1/me/addresses/...'],
  );
});

test('deletion, payment switches and backend messages use the document-derived key middleware', async () => {
  const { calls, fetch } = recordingFetch(202, { state: 'pending' });
  const client = createClient({ baseUrl: 'https://example.test', token: 't', fetch });

  await client.POST('/api/v1/me/deletion');
  await client.POST('/api/v1/me/deletion', { params: { header: { 'Idempotency-Key': 'deletion-receipt' } } });
  await client.POST('/api/v1/me/orders/{id}/payment-method', {
    params: { path: { id: 'order/one' } },
    body: { payment_method: 'card', from_payment: 'attempt-one' },
  });
  await client.POST('/api/v1/members/{sub}/messages', {
    params: { path: { sub: 'member/one' } },
    body: { category: 'service', title: 'Ready', body: 'Your report is ready.', channels: ['in_app'] },
  });

  for (const index of [0, 2, 3]) {
    assert.match(calls[index]?.headers.get('Idempotency-Key') ?? '', /^[0-9a-f-]{36}$/);
  }
  assert.equal(calls[1]?.headers.get('Idempotency-Key'), 'deletion-receipt');
  assert.equal(calls[2]?.url, 'https://example.test/api/v1/me/orders/order%2Fone/payment-method');
  assert.deepEqual(JSON.parse(calls[2]?.body ?? ''), { payment_method: 'card', from_payment: 'attempt-one' });
  assert.equal(calls[3]?.url, 'https://example.test/api/v1/members/member%2Fone/messages');
  assert.deepEqual(JSON.parse(calls[3]?.body ?? ''), {
    category: 'service',
    title: 'Ready',
    body: 'Your report is ready.',
    channels: ['in_app'],
  });
});

test('conditional reads return the original 304 Response with neither data nor error', async () => {
  for (const path of [
    '/api/v1/me',
    '/api/v1/me/entitlements',
    '/api/v1/me/organisations',
    '/api/v1/me/messages',
    '/api/v1/me/realtime/digest',
    '/api/v1/reference-data/address/countries',
  ] as const) {
    const requests: Request[] = [];
    const client = createClient({
      baseUrl: 'https://example.test',
      token: 't',
      fetch: async (request) => {
        requests.push(request);
        return new Response(null, { status: 304, headers: { ETag: '"current"' } });
      },
    });
    const result = await client.GET(path, { params: { header: { 'If-None-Match': '"current"' } } });
    assert.equal(requests[0]?.headers.get('If-None-Match'), '"current"', path);
    assert.equal(result.response.status, 304, path);
    assert.equal(result.response.headers.get('ETag'), '"current"', path);
    assert.equal(result.data, undefined, path);
    assert.equal(result.error, undefined, path);
    const requested = await client.request('get', path, { params: { header: { 'If-None-Match': '"current"' } } });
    assert.equal(requested.response.status, 304, path);
    assert.equal(requested.data, undefined, path);
    assert.equal(requested.error, undefined, path);
  }
});

test('every generic request handles 304 only when its operation documents it', async () => {
  const document: OpenAPI3 = parse(readFileSync(new URL('../spec/openapi.yaml', import.meta.url), 'utf8'));
  const paths = document.paths;
  assert.ok(paths);
  const referencedPath = '/api/v1/products';
  const referencedItem = paths[referencedPath];
  assert.ok(referencedItem);
  document.components = {
    ...document.components,
    pathItems: { ...document.components?.pathItems, ProductCatalogue: referencedItem },
  };
  paths[referencedPath] = { $ref: '#/components/pathItems/ProductCatalogue' };
  const visited = new Set<string>();
  let response = new Response(null, { status: 304 });
  const client = createClient({ baseUrl: 'https://example.test', fetch: async () => response });
  const request = client.request as (
    method: string,
    path: string,
    init: { params: { path: Record<string, string> } },
  ) => Promise<{ response: Response; data?: unknown; error?: unknown }>;
  let conditional = 0;
  let unconditional = 0;
  for (const [path, raw] of Object.entries(document.paths ?? {})) {
    const item = resolve<PathItemObject>(document, raw);
    for (const method of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const) {
      const rawOperation = item[method];
      if (rawOperation === undefined) continue;
      const operation = resolve<OperationObject>(document, rawOperation);
      response = new Response(null, { status: 304 });
      const pathParams = Object.fromEntries(
        Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => [match[1], 'example']),
      );
      const result = await request(method, path, { params: { path: pathParams } });
      const label = `${method.toUpperCase()} ${path}`;
      visited.add(label);
      const documented = Object.hasOwn(operation.responses ?? {}, '304');
      assert.equal(result.response, response, label);
      assert.equal(result.data, undefined, label);
      assert.equal(result.error, documented ? undefined : '', label);
      if (documented) conditional++;
      else unconditional++;
    }
  }
  assert.ok(conditional > 0);
  assert.ok(unconditional > 0);
  assert.ok(visited.has(`GET ${referencedPath}`));
});

test('undeclared 304s retain transport errors with zero content length on every entry point', async () => {
  const response = new Response(null, { status: 304, headers: { 'Content-Length': '0', ETag: '"saved"' } });
  const client = createClient({ baseUrl: 'https://example.test', fetch: async () => response });
  const calls = [
    ['GET', () => client.GET('/api/v1/products')],
    ['request(get)', () => client.request('get', '/api/v1/products')],
    ['POST', () => client.POST('/api/v1/me/deletion')],
    ['request(post)', () => client.request('post', '/api/v1/me/deletion')],
  ] as const;
  for (const [name, call] of calls) {
    const answer = await call();
    assert.equal(answer.response, response, name);
    assert.equal(answer.response.headers.get('ETag'), '"saved"', name);
    assert.equal(answer.data, undefined, name);
    assert.equal(answer.error, '', name);
  }
  for (const method of ['PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'] as const) {
    const call = client[method] as (path: string) => Promise<{ response: Response; data?: unknown; error?: unknown }>;
    const answer = await call('/api/v1/products');
    assert.equal(answer.response, response, method);
    assert.equal(answer.data, undefined, method);
    assert.equal(answer.error, '', method);
  }
  const trace = client.TRACE as (path: string) => Promise<unknown>;
  await assert.rejects(trace('/api/v1/products'), TypeError);
});

test('documented 304s remain bodyless with zero content length', async () => {
  const response = new Response(null, { status: 304, headers: { 'Content-Length': '0', ETag: '"saved"' } });
  const client = createClient({ baseUrl: 'https://example.test', fetch: async () => response });
  const calls = [() => client.GET('/api/v1/me/messages'), () => client.request('get', '/api/v1/me/messages')];
  for (const call of calls) {
    const answer = await call();
    assert.equal(answer.response, response);
    assert.equal(answer.response.headers.get('ETag'), '"saved"');
    assert.equal(answer.data, undefined);
    assert.equal(answer.error, undefined);
  }
});

test('an undocumented GET 304 retains the transport error result', async () => {
  const response = new Response(null, { status: 304 });
  const client = createClient({ baseUrl: 'https://example.test', fetch: async () => response });
  const result = await client.GET('/api/v1/products', { headers: { 'If-None-Match': '"saved"' } });
  assert.equal(result.response, response);
  assert.equal(result.error, '');
  assert.equal(result.data, undefined);
});

test('a generic POST 304 retains the same transport error result as POST', async () => {
  const client = createClient({
    baseUrl: 'https://example.test',
    fetch: async () => new Response(null, { status: 304 }),
  });
  const direct = await client.POST('/api/v1/me/deletion');
  const generic = await client.request('post', '/api/v1/me/deletion');
  assert.equal(direct.error, '');
  assert.equal(generic.error, direct.error);
  assert.equal(generic.data, undefined);
});

test('a conditional read with a changed representation returns its typed page and ETag', async () => {
  const page = { data: [], sequence: '9007199254740993' };
  const client = createClient({
    baseUrl: 'https://example.test',
    token: 't',
    fetch: async () => Response.json(page, { headers: { ETag: '"new"' } }),
  });
  const result = await client.GET('/api/v1/me/messages', { params: { header: { 'If-None-Match': '"old"' } } });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('ETag'), '"new"');
  assert.deepEqual(result.data, page);
  assert.equal(result.error, undefined);
});

test('inbox cursors and read-all boundaries remain opaque strings and preferences send only requested choices', async () => {
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.test', token: 't', fetch });
  await client.GET('/api/v1/me/messages/changes', { params: { query: { cursor: 'opaque+/=', limit: 5 } } });
  await client.POST('/api/v1/me/messages/read-all', { body: { through_sequence: '9007199254740993' } });
  await client.PUT('/api/v1/me/message-preferences', {
    body: { preferences: [{ category: 'promotional', channel: 'push', enabled: false }] },
  });
  await client.GET('/api/v1/me/realtime/events', { params: { query: { after: 0 } } });
  assert.equal(new URL(calls[0]?.url ?? '').searchParams.get('cursor'), 'opaque+/=');
  assert.deepEqual(JSON.parse(calls[1]?.body ?? ''), { through_sequence: '9007199254740993' });
  assert.deepEqual(JSON.parse(calls[2]?.body ?? ''), {
    preferences: [{ category: 'promotional', channel: 'push', enabled: false }],
  });
  assert.equal(new URL(calls[3]?.url ?? '').searchParams.get('after'), '0');
});

test('an expired inbox cursor remains a 410 problem for the caller to recover', async () => {
  const refusal = { type: 'https://appsolutely.io/problems/cursor-expired', title: 'Cursor expired', status: 410 };
  const { fetch } = recordingFetch(410, refusal, 'application/problem+json');
  const result = await createClient({ baseUrl: 'https://example.test', token: 't', fetch }).GET(
    '/api/v1/me/messages/changes',
    { params: { query: { cursor: 'old' } } },
  );
  assert.equal(result.response.status, 410);
  assert.equal(result.data, undefined);
  assert.deepEqual(result.error, refusal);
});
