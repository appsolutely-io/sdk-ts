import assert from 'node:assert/strict';
import { test } from 'node:test';
import { billingEntry, createClient } from '../src/index.ts';

function answering(status: number, body: unknown, contentType = 'application/json') {
  const urls: string[] = [];
  const fetch = async (input: Request): Promise<Response> => {
    urls.push(input.url);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
  };
  return { urls, client: createClient({ baseUrl: 'https://example.com', token: '1|secret', fetch }) };
}

test('an entry that appears is answered with its presentation and address', async () => {
  const shown = {
    available: true,
    wording: 'Manage billing',
    presentation: 'system_browser',
    needs_store_token: null,
    url: 'https://example.com/member/billing',
    expires_at: null,
  };
  const { urls, client } = answering(200, shown);

  const { entry, error } = await billingEntry(client, { store: 'direct' });

  assert.deepEqual(entry, shown);
  assert.equal(error, undefined);
  assert.equal(urls[0], 'https://example.com/api/v1/me/billing-entry?store=direct');
});

test('an entry that does not appear is null', async () => {
  const { client } = answering(200, { available: false });

  assert.equal((await billingEntry(client, { store: 'app_store', storefront: 'FR' })).entry, null);
});

test('the store token, platform and system are sent as query parameters', async () => {
  const { urls, client } = answering(200, { available: true, needs_store_token: null, url: 'https://example.com/x' });

  await billingEntry(client, {
    store: 'app_store',
    storefront: 'DE',
    store_token: 'tok',
    platform: 'ios',
    os_version: '26.4',
  });

  assert.equal(
    urls[0],
    'https://example.com/api/v1/me/billing-entry?store=app_store&storefront=DE&store_token=tok&platform=ios&os_version=26.4',
  );
});

test('a refusal is the problem document, with no entry', async () => {
  const problem = {
    type: 'https://appsolutely.io/problems/validation-failed',
    title: 'Validation failed',
    status: 422,
    errors: { store: ['required'] },
  };
  const { client } = answering(422, problem, 'application/problem+json');

  const { entry, error } = await billingEntry(client, { store: 'direct' });

  assert.equal(entry, undefined);
  assert.deepEqual(error, problem);
});
