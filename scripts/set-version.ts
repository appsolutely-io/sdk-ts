// Sets the package version in the main manifest and brings the alias to it, so the two never differ.
//   pnpm set-version 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { aliasFollowing, readAliasManifest, writeAliasManifest } from './lib/alias.ts';
import { PACKAGE_FILE } from './lib/spec.ts';

const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Usage: pnpm set-version <semver version>');
}
const main = { ...JSON.parse(readFileSync(PACKAGE_FILE, 'utf8')), version };
writeFileSync(PACKAGE_FILE, `${JSON.stringify(main, null, 2)}\n`);
writeAliasManifest(aliasFollowing(main, readAliasManifest()));
console.log(`Set ${main.name} and its alias to ${version}.`);
