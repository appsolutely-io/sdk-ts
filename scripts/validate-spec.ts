import { readFileSync } from 'node:fs';
import { SPEC_FILE, pinMismatch, readPin } from './lib/spec.ts';
import { validateDocument } from './lib/validate.ts';

const document = readFileSync(SPEC_FILE, 'utf8');
const mismatch = pinMismatch(readPin(), document);
const problems = [...(mismatch === null ? [] : [mismatch]), ...(await validateDocument(document))];

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('spec/openapi.yaml is a valid OpenAPI 3.1 document and matches its pin.');
