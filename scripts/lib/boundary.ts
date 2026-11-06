import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface BoundaryRule {
  length: number;
  sha256: string;
}

// Digests keep restricted vocabulary out of the published repository.
const BOUNDARY_RULES: readonly BoundaryRule[] = [
  { length: 6, sha256: 'e9da86d351cf9a7642d8c50195c3f466220911a15c177809bd1161a51e8c5f24' },
  { length: 7, sha256: 'fb0ca8b78747eecc29bdd76cc85cbbde29feb4f1579bb734e747c99ac3ccbf0f' },
];

export function matchesBoundary(line: string, rules: readonly BoundaryRule[] = BOUNDARY_RULES): boolean {
  const lower = line.toLowerCase();
  const qualified = lower.replace(/[^a-z0-9]+/g, ' ');
  return [lower, qualified].some((text) =>
    rules.some((rule) => {
      for (let offset = 0; offset <= text.length - rule.length; offset++) {
        if (
          createHash('sha256')
            .update(text.slice(offset, offset + rule.length))
            .digest('hex') === rule.sha256
        ) {
          return true;
        }
      }
      return false;
    }),
  );
}

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) {
    return [path];
  }
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** Every matching line under the given files and directories, as `path:line: text`. */
export function scanPaths(paths: string[], rules: readonly BoundaryRule[] = BOUNDARY_RULES): string[] {
  return paths.flatMap(files).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => (matchesBoundary(line, rules) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}
