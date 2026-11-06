import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);

/**
 * The aio repository (`owner/name`) the release and the watch read. The workflows supply it as the
 * `AIO_REPOSITORY` variable, so no repository is named in this package.
 */
export function aioRepository(env: NodeJS.ProcessEnv = process.env): string {
  const repository = env.AIO_REPOSITORY?.trim();
  if (repository === undefined || repository === '') {
    throw new Error('Set AIO_REPOSITORY to the aio repository, as owner/name.');
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`AIO_REPOSITORY is "${repository}"; give the aio repository as owner/name.`);
  }
  return repository;
}
export const AIO_SPEC_PATH = 'docs/api/openapi.yaml';
/** Every aio release is cut from this branch, so an untagged pin has to be a commit on it. */
export const AIO_DEFAULT_BRANCH = 'master';
export const PACKAGE_FILE = fileURLToPath(new URL('package.json', root));
export const SPEC_FILE = fileURLToPath(new URL('spec/openapi.yaml', root));
export const GENERATED_FILE = fileURLToPath(new URL('src/generated/schema.ts', root));
export const DIST_DIRECTORY = fileURLToPath(new URL('dist', root));

/** A final aio release; pre-releases never name the install a published client matches. */
export const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

/** Where the committed document came from, recorded in package.json so a published client names it. */
export interface SpecPin {
  path: string;
  tag: string | null;
  commit: string;
  sha256: string;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function readManifest(): Record<string, unknown> & {
  name: string;
  version: string;
  appsolutely?: { spec?: SpecPin };
} {
  return JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'));
}

export function readPin(): SpecPin {
  const pin = readManifest().appsolutely?.spec;
  if (pin === undefined) {
    throw new Error(`${PACKAGE_FILE} has no appsolutely.spec pin`);
  }
  return pin;
}

export function writePin(pin: SpecPin): void {
  const manifest = readManifest();
  manifest.appsolutely = { ...manifest.appsolutely, spec: pin };
  writeFileSync(PACKAGE_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** The command that repoints the pin, for messages that tell a person what to run. */
export const PIN_COMMAND = 'pnpm spec:pin --aio <aio checkout> --ref <tag or commit>';

/** Why the committed document is not the pinned one, or null when it is. */
export function pinMismatch(pin: SpecPin, document: string): string | null {
  return sha256(document) === pin.sha256
    ? null
    : `spec/openapi.yaml is not the document package.json pins; run ${PIN_COMMAND}.`;
}
