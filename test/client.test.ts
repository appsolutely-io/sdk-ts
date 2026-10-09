import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '../src/index.ts';

interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function recordingFetch(status = 200, body: unknown = { status: true, message: 'ok', data: [] }) {
  const calls: Recorded[] = [];
  const fetch = async (input: Request): Promise<Response> => {
    calls.push({ url: input.url, method: input.method, headers: input.headers, body: await input.text() });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetch };
}

test('a request carries the token as a bearer credential and asks for JSON', async () => {
  const { calls, fetch } = recordingFetch();
  const client = createClient({ baseUrl: 'https://example.com', token: '1|secret', fetch });

  await client.GET('/api/v1/articles', { params: { query: { per_page: 5 } } });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://example.com/api/v1/articles?per_page=5');
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
  const { calls, fetch } = recordingFetch(200, { status: true, message: 'ok', data: {} });
  const client = createClient({ baseUrl: 'https://example.com', token: 't', fetch });

  await client.PATCH('/api/v1/articles/{id}', { params: { path: { id: 42 } }, body: { title: 'Renamed' } });

  assert.equal(calls[0]?.method, 'PATCH');
  assert.equal(calls[0]?.url, 'https://example.com/api/v1/articles/42');
  assert.equal(calls[0]?.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0]?.body ?? ''), { title: 'Renamed' });
});

test('a refusal comes back as the typed error body, not a thrown exception', async () => {
  const refusal = { status: false, message: 'Unauthenticated.' };
  const { fetch } = recordingFetch(401, refusal);

  const { data, error, response } = await createClient({ baseUrl: 'https://example.com', fetch }).GET(
    '/api/v1/articles',
  );

  assert.equal(data, undefined);
  assert.equal(response.status, 401);
  assert.deepEqual(error, refusal);
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
    await assert.rejects(
      client.PATCH('/api/v1/articles/{id}', { params: { path: { id: id as unknown as number } }, body: {} }),
      TypeError,
    );
  }
  await client.PATCH('/api/v1/articles/{id}', { params: { path: { id: '...' as unknown as number } }, body: {} });

  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://example.com/api/v1/articles/...'],
  );
});
