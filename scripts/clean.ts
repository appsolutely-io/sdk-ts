import { rmSync } from 'node:fs';
import { DIST_DIRECTORY } from './lib/spec.ts';

rmSync(DIST_DIRECTORY, { recursive: true, force: true });
