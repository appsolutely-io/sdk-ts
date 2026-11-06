import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ALIAS_DIRECTORY, aliasFollowing, aliasProblems, readAliasManifest } from '../scripts/lib/alias.ts';
import { readManifest } from '../scripts/lib/spec.ts';

const main = (): Record<string, unknown> & { name: string; version: string } => readManifest();
const alias = (): Record<string, unknown> => readAliasManifest();

test('the alias package matches the main package', () => {
  assert.deepEqual(aliasProblems(main(), alias()), []);
});

test('an alias at another version is refused', () => {
  assert.match(aliasProblems(main(), { ...alias(), version: '9.9.9' }).join('\n'), /version 9\.9\.9/);
});

test('an alias pinning the main package to a range or another version is refused', () => {
  for (const pin of [`^${main().version}`, '9.9.9']) {
    const changed = { ...alias(), dependencies: { [main().name]: pin } };
    assert.match(aliasProblems(main(), changed).join('\n'), /pins/);
  }
});

test('an alias missing a subpath the main package exports is refused', () => {
  const extra = { ...main(), exports: { ...(main().exports as object), './extra': './dist/extra.js' } };
  assert.match(aliasProblems(extra, alias()).join('\n'), /\.\/extra/);
});

test('an alias with other licence, repository or publish settings is refused', () => {
  assert.match(aliasProblems(main(), { ...alias(), license: 'ISC' }).join('\n'), /license/);
  assert.match(
    aliasProblems(main(), { ...alias(), repository: { url: 'x', directory: 'y' } }).join('\n'),
    /repository/,
  );
  assert.match(aliasProblems(main(), { ...alias(), publishConfig: { access: 'public' } }).join('\n'), /publishConfig/);
});

test('the alias re-exports the main package and nothing else, and carries its licence', () => {
  const statement = `export * from '${main().name}';\n`;
  assert.equal(readFileSync(`${ALIAS_DIRECTORY}/index.js`, 'utf8'), statement);
  assert.equal(readFileSync(`${ALIAS_DIRECTORY}/index.d.ts`, 'utf8'), statement);
  assert.equal(readFileSync(`${ALIAS_DIRECTORY}/LICENSE`, 'utf8'), readFileSync('LICENSE', 'utf8'));
});

test('following a new main version brings the alias to that version and exact pin', () => {
  const next = { ...main(), version: '0.2.0' };
  const followed = aliasFollowing(next, alias());
  assert.deepEqual(aliasProblems(next, followed), []);
  assert.equal(followed.version, '0.2.0');
});
