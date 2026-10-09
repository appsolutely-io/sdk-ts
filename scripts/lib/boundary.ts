import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The spelling the published client must not carry: it addresses one install, whoever hosts it.
 * This scanner and its test are the only files that spell the words, because they must name what they refuse.
 */
export const BOUNDARY_PATTERN = /tenant|tenancy/i;

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
export function scanPaths(paths: string[]): string[] {
  return paths.flatMap(files).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => (BOUNDARY_PATTERN.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}
