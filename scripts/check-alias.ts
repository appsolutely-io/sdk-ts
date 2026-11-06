// Refuses to publish the alias package unless it follows the main package's manifest.
import { aliasProblems, readAliasManifest } from './lib/alias.ts';
import { readManifest } from './lib/spec.ts';

const problems = aliasProblems(readManifest(), readAliasManifest());
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Alias matches ${readManifest().name} ${readManifest().version}.`);
