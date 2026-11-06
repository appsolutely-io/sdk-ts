// Packs this package, installs the tarball into a fresh project, and holds what a consumer
// sees to the published contract: it type-checks under each module resolution with no `any`
// on a documented resource's data, runs (a request through the installed client reaches a
// stub fetch with the credential, and a client with no base URL answers from the bundled mock data), carries none of the words the boundary scan refuses, and names its spec pin.
//   pnpm check:consumer [--typescript 5.9.3,5.4.5]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ALIAS_DIRECTORY, readAliasManifest } from './lib/alias.ts';
import { scanPaths } from './lib/boundary.ts';
import { readManifest, readPin } from './lib/spec.ts';

const { values } = parseArgs({ options: { typescript: { type: 'string', default: '5.9.3' } } });
const versions = values.typescript.split(',');
const packageName = readManifest().name;
const aliasName = String(readAliasManifest().name);

const consumerSource = `import { createClient, type Product } from '${packageName}';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;

const client = createClient({ baseUrl: 'https://example.com', token: 'token' });

export async function read(): Promise<[Product, Product[]]> {
  const product = await client.GET('/api/v1/products/{id}', { params: { path: { id: '1' } } });
  const products = await client.GET('/api/v1/products');
  if (product.data === undefined || products.data === undefined) {
    throw new Error(product.error?.type ?? products.error?.type);
  }
  type Checks = [Assert<IsAny<typeof product.data>>, Assert<IsAny<typeof products.data.data>>];
  const checks: Checks | undefined = undefined;
  void checks;
  return [product.data, products.data.data];
}
`;

const runtimeSource = `import { createClient } from '${packageName}';

const seen = [];
const fetch = async (request) => {
  seen.push([request.url, request.headers.get('Authorization')]);
  return Response.json({ data: [] });
};
const { data } = await createClient({ baseUrl: 'https://example.com', token: 't', fetch }).GET('/api/v1/products');
if (JSON.stringify(seen) !== JSON.stringify([['https://example.com/api/v1/products', 'Bearer t']]) || !Array.isArray(data?.data)) {
  throw new Error('The installed client did not send the expected request: ' + JSON.stringify(seen));
}

const mocked = createClient();
const me = await mocked.GET('/api/v1/me');
if (mocked.mock !== true || me.data?.email !== 'member@example.test') {
  throw new Error('The installed client did not answer from its bundled mock data: ' + JSON.stringify(me.data));
}
`;

// The alias must hand out the very same objects, so instanceof and identity hold under either name.
const aliasRuntimeSource = `import * as main from '${packageName}';
import * as alias from '${aliasName}';

const names = Object.keys(main).sort();
const aliased = Object.keys(alias).sort();
if (names.length === 0 || JSON.stringify(aliased) !== JSON.stringify(names) || names.some((name) => alias[name] !== main[name])) {
  throw new Error('The alias does not re-export the main package as the same objects: ' + JSON.stringify({ names, aliased }));
}
`;

const aliasConsumerSource = consumerSource.replace(`from '${packageName}'`, `from '${aliasName}'`);

const resolutions = {
  nodenext: { module: 'NodeNext', moduleResolution: 'NodeNext' },
  bundler: { module: 'ESNext', moduleResolution: 'Bundler' },
};

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
}

const work = mkdtempSync(join(tmpdir(), 'sdk-consumer-'));
try {
  run('pnpm', ['pack', '--pack-destination', work], process.cwd());
  const tarball = readdirSync(work).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) {
    throw new Error('pnpm pack produced no tarball');
  }
  const aliasWork = join(work, 'alias');
  mkdirSync(aliasWork);
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', aliasWork], ALIAS_DIRECTORY);
  const aliasTarball = readdirSync(aliasWork).find((name) => name.endsWith('.tgz'));
  if (aliasTarball === undefined) {
    throw new Error('npm pack produced no alias tarball');
  }

  for (const version of versions) {
    const project = join(work, `ts-${version}`);
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
    run(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        join(work, tarball),
        join(aliasWork, aliasTarball),
        `typescript@${version}`,
      ],
      project,
    );
    writeFileSync(join(project, 'consumer.ts'), consumerSource);
    writeFileSync(join(project, 'alias-consumer.ts'), aliasConsumerSource);
    writeFileSync(join(project, 'runtime.mjs'), runtimeSource);
    writeFileSync(join(project, 'alias-runtime.mjs'), aliasRuntimeSource);
    run(process.execPath, ['runtime.mjs'], project);
    run(process.execPath, ['alias-runtime.mjs'], project);
    console.log(
      `TypeScript ${version} project: the installed client runs, and ${aliasName} hands out the same objects.`,
    );

    for (const [name, resolution] of Object.entries(resolutions)) {
      const config = {
        compilerOptions: { ...resolution, target: 'ES2022', lib: ['ES2022', 'DOM'], strict: true, noEmit: true },
        files: ['consumer.ts', 'alias-consumer.ts'],
      };
      writeFileSync(join(project, `tsconfig.${name}.json`), JSON.stringify(config));
      run(join(project, 'node_modules', '.bin', 'tsc'), ['-p', `tsconfig.${name}.json`], project);
      console.log(`TypeScript ${version}, ${name} resolution: the consumer type-checks.`);
    }

    const installed = join(project, 'node_modules', ...packageName.split('/'));
    const hits = scanPaths([installed, join(project, 'node_modules', ...aliasName.split('/'))]);
    if (hits.length > 0) {
      throw new Error(`The installed package carries boundary vocabulary:\n${hits.join('\n')}`);
    }
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
    if (JSON.stringify(manifest.appsolutely?.spec) !== JSON.stringify(readPin())) {
      throw new Error('The installed manifest does not carry the spec pin');
    }
    console.log(
      `TypeScript ${version}: no boundary vocabulary; the manifest pins aio ${manifest.appsolutely.spec.commit}.`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
