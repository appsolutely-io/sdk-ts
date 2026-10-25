import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generateSchema, generatedDrift } from '../scripts/lib/generate.ts';
import { spawnSync } from 'node:child_process';
import { transpileModule, ModuleKind } from 'typescript';
import { parse, stringify } from 'yaml';
import { RELEASE_TAG, SPEC_FILE, aioRepository, pinMismatch, readPin } from '../scripts/lib/spec.ts';

test('the committed document is the one the pin records', () => {
  assert.equal(pinMismatch(readPin(), readFileSync(SPEC_FILE, 'utf8')), null);
});

test('the pin names a full commit and, when it has one, a final release tag', () => {
  const pin = readPin();

  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  assert.ok(pin.tag === null || RELEASE_TAG.test(pin.tag), `unexpected tag ${String(pin.tag)}`);
});

test('the committed client types are what the committed document generates', async () => {
  assert.equal(await generatedDrift(readFileSync(SPEC_FILE, 'utf8')), null);
});

test('generation includes only effective required idempotency headers in a stable runtime registry', async () => {
  const key = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } };
  const responses = { 204: { description: 'Accepted' } };
  const document = {
    openapi: '3.1.0',
    info: { title: 'Example', version: '1' },
    components: { parameters: { Key: key } },
    paths: {
      '/inherited/{id}': {
        parameters: [
          { $ref: '#/components/parameters/Key' },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        post: { responses },
        delete: { parameters: [{ ...key, required: false }], responses },
      },
      '/direct': { patch: { parameters: [key], responses } },
      '/referenced': { put: { parameters: [{ $ref: '#/components/parameters/Key' }], responses } },
      '/optional': { post: { parameters: [{ ...key, required: false }], responses } },
      '/query': { post: { parameters: [{ ...key, in: 'query' }], responses } },
      '/plain': { get: { responses } },
    },
  };
  const generated = await generateSchema(stringify(document));
  const { outputText } = transpileModule(generated, { compilerOptions: { module: ModuleKind.ESNext } });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

  assert.deepEqual(module.keyedOperations, {
    'PATCH /direct': true,
    'POST /inherited/{id}': true,
    'PUT /referenced': true,
  });
  assert.deepEqual(Object.keys(module.keyedOperations), Object.keys(module.keyedOperations).sort());
  assert.equal(await generateSchema(stringify(document)), generated);

  const empty = await generateSchema(stringify({ ...document, paths: {} }));
  const emptyJs = transpileModule(empty, { compilerOptions: { module: ModuleKind.ESNext } }).outputText;
  const emptyModule = await import(`data:text/javascript;base64,${Buffer.from(emptyJs).toString('base64')}`);
  assert.deepEqual(emptyModule.keyedOperations, {});
});

test('a newly documented keyed operation generates a buildable client that supplies its key', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const work = mkdtempSync(join(tmpdir(), 'sdk-generation-'));
  try {
    for (const path of ['src', 'scripts', 'spec', 'package.json', 'tsconfig.json', 'tsconfig.build.json']) {
      cpSync(join(root, path), join(work, path), { recursive: true });
    }
    symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'), 'dir');
    const document = parse(readFileSync(SPEC_FILE, 'utf8'));
    document.paths['/api/v1/example-writes/{id}'] = {
      post: {
        operationId: 'createExampleWrite',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: { 204: { description: 'Accepted' } },
      },
    };
    writeFileSync(join(work, 'spec/openapi.yaml'), stringify(document));
    for (const args of [
      ['scripts/generate.ts'],
      [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
import { createClient } from './dist/index.js';
const keys = [];
const client = createClient({ baseUrl: 'https://example.test', fetch: async (request) => {
  keys.push(request.headers.get('Idempotency-Key'));
  return new Response(null, { status: 204 });
} });
await client.POST('/api/v1/example-writes/{id}', { params: { path: { id: 'example' } } });
await client.POST('/api/v1/example-writes/{id}', { params: { path: { id: 'example' }, header: { 'Idempotency-Key': 'own-key' } } });
assert.match(keys[0], /^[0-9a-f-]{36}$/);
assert.equal(keys[1], 'own-key');`,
      ],
    ]) {
      const result = spawnSync(process.execPath, args, { cwd: work, encoding: 'utf8' });
      assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('the aio repository comes from AIO_REPOSITORY, as owner/name', () => {
  assert.equal(aioRepository({ AIO_REPOSITORY: ' example/aio ' }), 'example/aio');
});

test('an unset or malformed AIO_REPOSITORY is refused with what to set', () => {
  assert.throws(() => aioRepository({}), /AIO_REPOSITORY/);
  assert.throws(() => aioRepository({ AIO_REPOSITORY: 'aio' }), /owner\/name/);
  assert.throws(() => aioRepository({ AIO_REPOSITORY: 'a/b/c' }), /owner\/name/);
});

test('no tracked file names the organisation the aio repository is kept in', () => {
  const organisation = ['appsolutely', 'io'].join('');
  // A hook can export git's own variables; drop them so the search reads this checkout.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const search = spawnSync('git', ['grep', '-l', '-i', '-F', organisation], { encoding: 'utf8', env });

  assert.equal(search.status, 1, `named in: ${search.stdout.trim()}`);
});
