import createFetchClient, { defaultPathSerializer, type Client } from 'openapi-fetch';
import type { paths } from './generated/schema.ts';

export interface ClientOptions {
  /** The install's origin, with any path it is served under: `https://example.com`. */
  baseUrl: string;
  /** A Sanctum personal access token, sent as a bearer credential on every request. */
  token?: string | undefined;
  /** Headers sent on every request beside the credential, in any form `new Headers()` accepts. */
  headers?: HeadersInit | undefined;
  /** A fetch implementation, for runtimes or tests that supply their own. */
  fetch?: ((request: Request) => Promise<Response>) | undefined;
}

export type AppsolutelyClient = Client<paths, 'application/json'>;

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
 * typed `error` body rather than throwing.
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

  return createFetchClient<paths, 'application/json'>({
    baseUrl: options.baseUrl,
    // A plain object: openapi-fetch tells a Headers apart with instanceof against the global at request
    // time, so a Headers made before a polyfill replaces the global would be read as having no entries.
    headers: plainHeaders,
    pathSerializer,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}
