import bundledAnswers from './mock/aio.json' with { type: 'json' };
import type { paths } from './generated/schema.ts';

/** Every documented operation, as `METHOD /path/{template}`: `GET /api/v1/me`, `GET /api/v1/products/{id}`. */
export type OperationKey = {
  [Path in keyof paths]: {
    [Method in keyof paths[Path]]-?: paths[Path][Method] extends { responses: unknown }
      ? `${Uppercase<Method & string>} ${Path & string}`
      : never;
  }[keyof paths[Path]];
}[keyof paths];

type OperationOf<Key> = Key extends `${infer Method} ${infer Path}`
  ? Path extends keyof paths
    ? Lowercase<Method> extends keyof paths[Path]
      ? paths[Path][Lowercase<Method>]
      : never
    : never
  : never;

/** Any body the operation documents, for any of its statuses: a success or a problem document. */
type BodyOf<Operation> = Operation extends { responses: infer Responses }
  ? {
      [Status in keyof Responses]: Responses[Status] extends { content: infer Content }
        ? Content[keyof Content]
        : never;
    }[keyof Responses]
  : never;

/** What mock mode answers one operation with. */
export interface MockAnswer<Body = unknown> {
  /** The HTTP status, an integer from 200 to 599. */
  status: number;
  /** The JSON body. Leave it out for an answer with none; a `204`, `205` or `304` must have none. */
  body?: Body | undefined;
  /** Headers beside `Content-Type`, which is set from the status. */
  headers?: Record<string, string> | undefined;
}

/** Answers by operation; a path parameter's value does not change which answer is served. */
export type MockOperations = { [Key in OperationKey]?: MockAnswer<BodyOf<OperationOf<Key>>> | undefined };

/** How mock mode answers. */
export interface MockOptions {
  /** Answers layered over the bundled ones: an operation named here replaces the bundled answer for it. */
  operations?: MockOperations | undefined;
  /** `false` starts from no bundled answers, so only `operations` are served. */
  bundled?: boolean | undefined;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The bundled sample answers (`aio.json`): one member at `example.test`, plans, a catalogue, orders and
 * entitlements. Frozen, so a caller changing it cannot change what every later client serves.
 */
export const mockOperations: Readonly<MockOperations> = deepFreeze(
  bundledAnswers.operations as unknown as MockOperations,
);

/** The response header every mocked answer carries, set to `1`, so an app can show it is not real data. */
export const MOCK_HEADER = 'x-appsolutely-mock';

/** The origin a mock client addresses in place of any baseUrl; `.invalid` never resolves (RFC 6761). */
export const MOCK_BASE_URL = 'https://mock.invalid';

export const MOCK_NOTICE =
  'Appsolutely client in mock mode: requests are answered from bundled sample data and nothing is sent to a server.';

export const MOCK_IGNORES_BASE_URL = 'The baseUrl passed is ignored while mock mode is on.';

/** The answers a mock client serves: the bundled ones unless turned off, with the caller's on top. */
export function mockAnswers(options: MockOptions): MockOperations {
  return { ...(options.bundled === false ? {} : mockOperations), ...options.operations };
}

interface Route {
  method: string;
  pattern: RegExp;
  /** One entry per path segment: 0 for a literal, 1 for a parameter. */
  shape: number[];
  answer: MockAnswer;
}

const NULL_BODY_STATUSES = [204, 205, 304];

function route(key: string, answer: MockAnswer): Route {
  if (!Number.isInteger(answer.status) || answer.status < 200 || answer.status > 599) {
    throw new TypeError(`mock answer for ${key} has status ${String(answer.status)}; use an integer from 200 to 599`);
  }
  if (NULL_BODY_STATUSES.includes(answer.status) && answer.body !== undefined) {
    throw new TypeError(`mock answer for ${key} is a ${String(answer.status)}, which cannot carry a body`);
  }
  const separator = key.indexOf(' ');
  const template = key.slice(separator + 1);
  const pieces = template.split(/\{[^}]+\}/);
  return {
    method: key.slice(0, separator),
    pattern: new RegExp(`^${pieces.map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}$`),
    shape: template.split('/').map((segment) => (segment.includes('{') ? 1 : 0)),
    answer,
  };
}

/** Orders routes so that, segment by segment, a literal is tried before a parameter. */
function bySpecificity(a: Route, b: Route): number {
  for (let index = 0; index < Math.max(a.shape.length, b.shape.length); index++) {
    const difference = (a.shape[index] ?? 0) - (b.shape[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function respond(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const head = new Headers(headers);
  head.set(MOCK_HEADER, '1');
  if (body === undefined) {
    return new Response(null, { status, headers: head });
  }
  head.set('Content-Type', status >= 400 ? 'application/problem+json' : 'application/json');
  return new Response(JSON.stringify(body), { status, headers: head });
}

/**
 * A fetch that never reaches the network: it answers each request from `operations`, matched by method
 * and path template, and answers an operation it has no answer for with a `501` problem document.
 */
export function mockTransport(
  operations: MockOperations | Record<string, MockAnswer | undefined>,
  baseUrl: string,
): (request: Request) => Promise<Response> {
  const routes = Object.entries(operations)
    .flatMap(([key, answer]) => (answer === undefined ? [] : [route(key, answer as MockAnswer)]))
    .sort(bySpecificity);
  const prefix = new URL(baseUrl).pathname.replace(/\/$/, '');

  return async (request) => {
    const pathname = new URL(request.url).pathname;
    const path = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
    const match = routes.find((candidate) => candidate.method === request.method && candidate.pattern.test(path));
    if (match === undefined) {
      return respond(501, {
        type: 'about:blank',
        title: 'Not Implemented',
        status: 501,
        detail: `Mock mode has no answer for ${request.method} ${path}; add one with mock.operations.`,
      });
    }
    return respond(match.answer.status, match.answer.body, match.answer.headers);
  };
}
