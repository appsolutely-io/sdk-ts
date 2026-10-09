// Refuses a publish that would not match its contract: the pin names a final aio release, the
// document is valid and is the pinned one, the client types are what it generates, and the built
// package carries none of the words the boundary scan refuses.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { scanPaths } from './lib/boundary.ts';
import { generatedDrift } from './lib/generate.ts';
import { pinProblems } from './lib/publishable.ts';
import { DIST_DIRECTORY, PACKAGE_FILE, SPEC_FILE, readPin } from './lib/spec.ts';
import { validateDocument } from './lib/validate.ts';

const { values } = parseArgs({ options: { 'aio-tag': { type: 'string' } } });
const document = readFileSync(SPEC_FILE, 'utf8');
const problems = [...pinProblems(readPin(), document), ...(await validateDocument(document))];
if (values['aio-tag'] !== undefined && readPin().tag !== values['aio-tag']) {
  problems.push(`The spec pin names aio ${String(readPin().tag)}, not the requested ${values['aio-tag']}.`);
}

const drift = await generatedDrift(document);
if (drift !== null) {
  problems.push(drift);
}
if (!existsSync(DIST_DIRECTORY)) {
  problems.push('dist/ is missing; run pnpm build.');
} else {
  problems.push(...scanPaths([DIST_DIRECTORY, PACKAGE_FILE]).map((hit) => `boundary vocabulary: ${hit}`));
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Publishable: generated from aio ${readPin().tag} (${readPin().commit}).`);
