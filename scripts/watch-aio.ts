// Fails when aio has a final release this package is behind, so a scheduled run turns red until the
// Release workflow is run for it. Reads aio through gh, which needs GH_TOKEN with read access to aio and AIO_REPOSITORY naming it.
import { execFileSync } from 'node:child_process';
import { watchVerdict } from './lib/release.ts';
import { aioRepository, readPin } from './lib/spec.ts';

function gh(args: string[]): string {
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8' });
}

const pin = readPin();
const repository = aioRepository();
const tags = gh([`repos/${repository}/tags`, '--paginate', '--jq', '.[].name']).split('\n');
// One page only: paginating a comparison prints its status once per page of commits.
const verdict = watchVerdict(tags, pin.tag, (tag) =>
  ['ahead', 'identical'].includes(gh([`repos/${repository}/compare/${pin.commit}...${tag}`, '--jq', '.status']).trim()),
);

if (!verdict.ok) {
  console.error(verdict.message);
  process.exit(1);
}
console.log(verdict.message);
