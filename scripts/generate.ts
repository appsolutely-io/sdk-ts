// Writes the client types from the committed document; with --check, fails instead when they differ.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { generateSchema, generatedDrift } from './lib/generate.ts';
import { GENERATED_FILE, SPEC_FILE } from './lib/spec.ts';

const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
const document = readFileSync(SPEC_FILE, 'utf8');

if (values.check) {
  const drift = await generatedDrift(document);
  if (drift !== null) {
    console.error(drift);
    process.exit(1);
  }
  console.log('src/generated/schema.ts is up to date.');
} else {
  mkdirSync(dirname(GENERATED_FILE), { recursive: true });
  writeFileSync(GENERATED_FILE, await generateSchema(document));
  console.log('Wrote src/generated/schema.ts.');
}
