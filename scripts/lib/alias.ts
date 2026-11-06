import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The alias package, which re-exports the main package under a second name at the same version. */
export const ALIAS_DIRECTORY = fileURLToPath(new URL('../../packages/asly-sdk', import.meta.url));

export function readAliasManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(`${ALIAS_DIRECTORY}/package.json`, 'utf8'));
}

type Manifest = Record<string, unknown>;

function subpaths(manifest: Manifest): string[] {
  const exports = manifest.exports;
  return typeof exports === 'object' && exports !== null ? Object.keys(exports).sort() : [];
}

function repositoryUrl(manifest: Manifest): unknown {
  const repository = manifest.repository;
  return typeof repository === 'object' && repository !== null ? (repository as Manifest).url : repository;
}

/**
 * Why the alias would not publish as the same package under another name: its version, its exact pin of
 * the main package, its export subpaths, its licence, repository and publish settings must all follow
 * the main package's manifest, which is the one source of the version.
 */
export function aliasProblems(main: Manifest & { name: string; version: string }, alias: Manifest): string[] {
  const problems: string[] = [];
  if (alias.version !== main.version) {
    problems.push(`The alias is at version ${String(alias.version)}; the main package is at ${main.version}.`);
  }
  const dependencies = (alias.dependencies ?? {}) as Manifest;
  if (dependencies[main.name] !== main.version) {
    problems.push(`The alias pins ${main.name} to ${String(dependencies[main.name])}, not exactly ${main.version}.`);
  }
  if (Object.keys(dependencies).length !== 1) {
    problems.push(`The alias depends on ${Object.keys(dependencies).join(', ')}; it may depend on ${main.name} alone.`);
  }
  const missing = subpaths(main).filter((path) => !subpaths(alias).includes(path));
  const extra = subpaths(alias).filter((path) => !subpaths(main).includes(path));
  if (missing.length > 0 || extra.length > 0) {
    problems.push(
      `The alias exports differ from the main package: missing ${missing.join(', ') || 'none'}, extra ${extra.join(', ') || 'none'}.`,
    );
  }
  if (alias.license !== main.license) {
    problems.push(`The alias license is ${String(alias.license)}; the main package's is ${String(main.license)}.`);
  }
  const directory = (alias.repository as Manifest | undefined)?.directory;
  if (repositoryUrl(alias) !== repositoryUrl(main) || directory !== 'packages/asly-sdk') {
    problems.push('The alias repository must be the main package repository with directory packages/asly-sdk.');
  }
  if (JSON.stringify(alias.publishConfig) !== JSON.stringify(main.publishConfig)) {
    problems.push(`The alias publishConfig ${JSON.stringify(alias.publishConfig)} differs from the main package's.`);
  }
  return problems;
}

/** The alias manifest at the main package's version, with the exact pin that goes with it. */
export function aliasFollowing(main: Manifest & { name: string; version: string }, alias: Manifest): Manifest {
  return { ...alias, version: main.version, dependencies: { [main.name]: main.version } };
}

export function writeAliasManifest(alias: Manifest): void {
  writeFileSync(`${ALIAS_DIRECTORY}/package.json`, `${JSON.stringify(alias, null, 2)}\n`);
}
