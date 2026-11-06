import { Validator } from '@seriousme/openapi-schema-validator';
import { parse } from 'yaml';

/** Problems a standard OpenAPI 3.1 schema validator finds in the document; empty when it is valid. */
export async function validateDocument(text: string): Promise<string[]> {
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    return [`not YAML: ${(error as Error).message}`];
  }

  const version = (document as { openapi?: unknown } | null)?.openapi;
  if (typeof version !== 'string' || !version.startsWith('3.1.')) {
    return [`openapi is ${String(version)}; this package generates from OpenAPI 3.1 documents only`];
  }

  const result = await new Validator().validate(document as Record<string, unknown>);
  if (result.valid) {
    return [];
  }
  if (!Array.isArray(result.errors)) {
    return [String(result.errors)];
  }
  return result.errors.map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`);
}
