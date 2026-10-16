// Packs this package, installs the tarball into a fresh project, and holds what a consumer
// sees to the published contract: it type-checks under each module resolution with no `any`
// on a documented resource's data, runs (a request through the installed client reaches a
// stub fetch with the credential), carries none of the words the boundary scan refuses, and names its spec pin.
//   pnpm check:consumer [--typescript 5.9.3,5.4.5]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { scanPaths } from './lib/boundary.ts';
import { readPin } from './lib/spec.ts';

const { values } = parseArgs({ options: { typescript: { type: 'string', default: '5.9.3' } } });
const versions = values.typescript.split(',');

const consumerSource = `import { createClient, type Product } from '@appsolutely/sdk';

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

const runtimeSource = `import { createClient } from '@appsolutely/sdk';

const seen = [];
const fetch = async (request) => {
  seen.push([request.url, request.headers.get('Authorization')]);
  return Response.json({ data: [] });
};
const { data } = await createClient({ baseUrl: 'https://example.com', token: 't', fetch }).GET('/api/v1/products');
if (JSON.stringify(seen) !== JSON.stringify([['https://example.com/api/v1/products', 'Bearer t']]) || !Array.isArray(data?.data)) {
  throw new Error('The installed client did not send the expected request: ' + JSON.stringify(seen));
}
`;

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

  for (const version of versions) {
    const project = join(work, `ts-${version}`);
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
    run(
      'npm',
      ['install', '--no-audit', '--no-fund', '--ignore-scripts', join(work, tarball), `typescript@${version}`],
      project,
    );
    writeFileSync(join(project, 'consumer.ts'), consumerSource);
    writeFileSync(join(project, 'runtime.mjs'), runtimeSource);
    run(process.execPath, ['runtime.mjs'], project);
    console.log(`TypeScript ${version} project: the installed client runs.`);

    for (const [name, resolution] of Object.entries(resolutions)) {
      const config = {
        compilerOptions: { ...resolution, target: 'ES2022', lib: ['ES2022', 'DOM'], strict: true, noEmit: true },
        files: ['consumer.ts'],
      };
      writeFileSync(join(project, `tsconfig.${name}.json`), JSON.stringify(config));
      run(join(project, 'node_modules', '.bin', 'tsc'), ['-p', `tsconfig.${name}.json`], project);
      console.log(`TypeScript ${version}, ${name} resolution: the consumer type-checks.`);
    }

    const installed = join(project, 'node_modules', '@appsolutely', 'sdk');
    const hits = scanPaths([installed]);
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
