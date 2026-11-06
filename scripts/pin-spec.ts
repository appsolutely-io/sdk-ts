// Repoints the committed document at one aio commit or release tag:
//   pnpm spec:pin --aio <path to an aio checkout> --ref <tag or commit>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { resolvePin } from './lib/pin.ts';
import { AIO_SPEC_PATH, SPEC_FILE, writePin } from './lib/spec.ts';

const { values } = parseArgs({ options: { aio: { type: 'string' }, ref: { type: 'string' } } });
if (values.aio === undefined || values.ref === undefined) {
  throw new Error('Usage: pnpm spec:pin --aio <aio checkout> --ref <tag or commit>');
}

const pin = resolvePin(values.aio, values.ref);
mkdirSync(dirname(SPEC_FILE), { recursive: true });
writeFileSync(SPEC_FILE, pin.document);
writePin({ path: AIO_SPEC_PATH, tag: pin.tag, commit: pin.commit, sha256: pin.sha256 });

console.log(`Pinned ${AIO_SPEC_PATH} at ${pin.commit}${pin.tag === null ? ' (no release tag)' : ` (${pin.tag})`}.`);
