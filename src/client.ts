import createFetchClient, { defaultPathSerializer, type Client, type Middleware } from 'openapi-fetch';
import { keyedOperations, type paths } from './generated/schema.ts';

export interface ClientOptions {
  /** The install's origin, with any path it is served under: `https://example.com`. */
  baseUrl: string;
  /**
   * The bearer credential sent on every request: a signed-in member's access token, or the token the
   * site backend's machine client is granted. Leave it out for the routes that need none.
   */
  token?: string | undefined;
  /** Headers sent on every request beside the credential, in any form `new Headers()` accepts. */
  headers?: HeadersInit | undefined;
  /** A fetch implementation, for runtimes or tests that supply their own. */
  fetch?: ((request: Request) => Promise<Response>) | undefined;
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
export type AppsolutelyClient = Client<ClientPaths, 'application/json' | 'application/problem+json'>;

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

function assertBaseUrl(baseUrl: string): void {
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
      `baseUrl must be an absolute http(s) URL with no query or fragment, got ${JSON.stringify(baseUrl)}`,
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
  assertBaseUrl(options.baseUrl);
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
    baseUrl: options.baseUrl,
    // A plain object: openapi-fetch tells a Headers apart with instanceof against the global at request
    // time, so a Headers made before a polyfill replaces the global would be read as having no entries.
    headers: plainHeaders,
    pathSerializer,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  client.use(idempotencyKey);
  return client;
}
