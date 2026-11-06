import createFetchClient, { defaultPathSerializer, type Client, type Middleware } from 'openapi-fetch';
import { keyedOperations, type paths } from './generated/schema.ts';
import {
  MOCK_BASE_URL,
  MOCK_IGNORES_BASE_URL,
  MOCK_NOTICE,
  mockAnswers,
  mockTransport,
  type MockOptions,
} from './mock.ts';

export interface ClientOptions {
  /**
   * The install's origin, with any path it is served under: `https://example.com`. Required unless
   * mock mode is on, which ignores it.
   */
  baseUrl?: string | undefined;
  /**
   * The bearer credential sent on every request: a signed-in member's access token, or the token the
   * site backend's machine client is granted. Leave it out for the routes that need none.
   */
  token?: string | undefined;
  /** Headers sent on every request beside the credential, in any form `new Headers()` accepts. */
  headers?: HeadersInit | undefined;
  /** A fetch implementation, for runtimes or tests that supply their own. Mock mode does not call it. */
  fetch?: ((request: Request) => Promise<Response>) | undefined;
  /**
   * Mock mode, off unless set. `true`, or answers to layer over the bundled ones, answers every request
   * from bundled sample data and ignores `baseUrl`; each answer carries the `x-appsolutely-mock` header.
   */
  mock?: boolean | MockOptions | undefined;
}

const IDEMPOTENCY_KEY = 'Idempotency-Key';

type KeyedParameters = { parameters: { header: { [IDEMPOTENCY_KEY]: string } } };

/** An operation whose `Idempotency-Key` header the client fills, so the caller may leave it out. */
type WithOptionalKey<Operation> = Operation extends KeyedParameters
  ? Omit<Operation, 'parameters'> & {
      parameters: Omit<Operation['parameters'], 'header'> & {
        header?: Omit<Operation['parameters']['header'], typeof IDEMPOTENCY_KEY> & { [IDEMPOTENCY_KEY]?: string };
      };
    }
  : Operation;

/** The document's paths, with the `Idempotency-Key` of every keyed create optional. */
export type ClientPaths = {
  [Path in keyof paths]: { [Method in keyof paths[Path]]: WithOptionalKey<paths[Path][Method]> };
};

/** Successes are `application/json`; refusals are RFC 9457 `application/problem+json`, typed as `error`. */
export type AppsolutelyClient = Client<ClientPaths, 'application/json' | 'application/problem+json'> & {
  /** True when requests are answered from mock data and never reach a server. */
  readonly mock: boolean;
};

type KeyedOperation = {
  [Path in keyof paths]: {
    [Method in keyof paths[Path]]-?: paths[Path][Method] extends KeyedParameters
      ? `${Uppercase<Method & string>} ${Path & string}`
      : never;
  }[keyof paths[Path]];
}[keyof paths];

const KEYED_OPERATIONS: Record<KeyedOperation, true> = keyedOperations;

/**
 * Sends a generated `Idempotency-Key` on each keyed create the caller sent none for. The key is on the
 * Request handed to `fetch`, so a fetch that retries that Request repeats the key and gets the first answer.
 */
const idempotencyKey: Middleware = {
  onRequest({ request, schemaPath }) {
    if (`${request.method} ${schemaPath}` in KEYED_OPERATIONS && !request.headers.has(IDEMPOTENCY_KEY)) {
      request.headers.set(IDEMPOTENCY_KEY, globalThis.crypto.randomUUID());
    }
    return request;
  },
};

const BASE_URL_FIX = 'set baseUrl, or pass mock: true to use the bundled sample data';

function assertBaseUrl(baseUrl: string | undefined): asserts baseUrl is string {
  if (baseUrl === undefined) {
    throw new TypeError(`baseUrl is required when mock mode is off: ${BASE_URL_FIX}`);
  }
  let url: URL | undefined;
  try {
    url = new URL(baseUrl);
  } catch {
    // Not absolute; refused below.
  }
  // Paths are appended to baseUrl as text, so a query or fragment, even an empty one, would end up in
  // front of them; URL reports an empty one as no query at all, so the text is checked.
  if (url === undefined || !['https:', 'http:'].includes(url.protocol) || /[?#]/.test(baseUrl)) {
    throw new TypeError(
      `baseUrl must be an absolute http(s) URL with no query or fragment, got ${JSON.stringify(baseUrl)}: ${BASE_URL_FIX}`,
    );
  }
}

function assertToken(token: string): void {
  // Sanctum tokens are visible ASCII; anything else would fail as a header value on every request.
  if (!/^[\x21-\x7e]+$/.test(token)) {
    throw new TypeError('token must be a non-empty run of visible ASCII characters');
  }
}

/**
 * Fills path parameters as openapi-fetch does, refusing a value that would make the segment empty,
 * `.` or `..`: the URL would resolve to another route, which would then be sent the request.
 */
function pathSerializer(pathname: string, pathParams: Record<string, unknown>): string {
  for (const [name, value] of Object.entries(pathParams)) {
    if (['', '.', '..'].includes(String(value)) && pathname.includes(`{${name}}`)) {
      throw new TypeError(`path parameter ${name} cannot be ${JSON.stringify(String(value))}`);
    }
  }
  return defaultPathSerializer(pathname, pathParams);
}

/**
 * A typed client for one install's public API. Every path, parameter, body and response is
 * typed from the OpenAPI document the package was generated from; a refusal resolves as the
 * typed problem document in `error` rather than throwing, branched on by its `type`.
 */
export function createClient(options: ClientOptions): AppsolutelyClient {
  // Only the caller's switch turns mock mode on: a missing or unusable baseUrl is a configuration error,
  // never a reason to answer from sample data.
  const mock = options.mock === true || (typeof options.mock === 'object' && options.mock !== null);
  const baseUrl = mock ? MOCK_BASE_URL : options.baseUrl;
  assertBaseUrl(baseUrl);
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.token !== undefined) {
    assertToken(options.token);
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const plainHeaders: Record<string, string> = {};
  headers.forEach((value, name) => {
    plainHeaders[name] = value;
  });

  const client = createFetchClient<ClientPaths, 'application/json' | 'application/problem+json'>({
    baseUrl,
    // A plain object: openapi-fetch tells a Headers apart with instanceof against the global at request
    // time, so a Headers made before a polyfill replaces the global would be read as having no entries.
    headers: plainHeaders,
    pathSerializer,
    ...(mock
      ? { fetch: mockTransport(mockAnswers(typeof options.mock === 'object' ? options.mock : {}), baseUrl) }
      : options.fetch === undefined
        ? {}
        : { fetch: options.fetch }),
  });
  client.use(idempotencyKey);
  if (mock) {
    console.warn(options.baseUrl === undefined ? MOCK_NOTICE : `${MOCK_NOTICE} ${MOCK_IGNORES_BASE_URL}`);
  }
  return Object.defineProperty(client, 'mock', { value: mock, enumerable: true }) as AppsolutelyClient;
}
