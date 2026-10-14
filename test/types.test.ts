// Compile-time assertions, checked by `pnpm typecheck`: the response data of the documented
// resources is their model type, never `any`, and a refusal is a problem document typed by its `type`.
import { test } from 'node:test';
import {
  createClient,
  type Article,
  type ArticlePage,
  type BackendClient,
  type FormEntry,
  type ListedAccountStatePage,
  type Order,
  type Page,
  type Problem,
  type Product,
  type ProductSkuPrice,
} from '../src/index.ts';
import type { IsAny } from './support/types.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const client = createClient({ baseUrl: 'https://example.com', token: 't' });
type Data<T extends (...args: never[]) => Promise<{ data?: unknown }>> = NonNullable<Awaited<ReturnType<T>>['data']>;

const listArticles = () => client.GET('/api/v1/articles');
const getArticle = () => client.GET('/api/v1/articles/{id}', { params: { path: { id: '1' } } });
const getPage = () => client.GET('/api/v1/pages/{id}', { params: { path: { id: '1' } } });
const getProduct = () => client.GET('/api/v1/products/{id}', { params: { path: { id: '1' } } });
const getOrder = () => client.GET('/api/v1/orders/{id}', { params: { path: { id: '1' } } });
const getFormEntry = () => client.GET('/api/v1/form-entries/{id}', { params: { path: { id: '1' } } });
const refused = async () => (await client.GET('/api/v1/articles')).error;
type Refusal = NonNullable<Awaited<ReturnType<typeof refused>>>;

export type Checks = [
  Assert<Equal<IsAny<Data<typeof listArticles>['data']>, false>>,
  Assert<Equal<Data<typeof listArticles>, ArticlePage>>,
  Assert<Equal<Data<typeof listArticles>['data'], Article[]>>,
  Assert<Equal<ArticlePage['next_cursor'], string | undefined>>,
  Assert<Equal<Data<typeof getArticle>, Article>>,
  Assert<Equal<Data<typeof getPage>, Page>>,
  Assert<Equal<Data<typeof getProduct>, Product>>,
  Assert<Equal<Data<typeof getOrder>, Order>>,
  Assert<Equal<Data<typeof getFormEntry>, FormEntry>>,
  Assert<Equal<Article['id'], string>>,
  Assert<Refusal extends Problem ? true : false>,
  Assert<Equal<IsAny<Refusal['type']>, false>>,
  // Narrowed to the documented type URIs, so a branch on a misspelt one is a compile error.
  Assert<string extends Refusal['type'] ? false : true>,
  Assert<'https://appsolutely.io/problems/unauthenticated' extends Refusal['type'] ? true : false>,
];

// The catalogue a backend reads: each sku's price, the store currency, entitlements walked by change time.
const listEntitlements = () =>
  client.GET('/api/v1/entitlements', { params: { query: { changed_since: '2026-10-01T00:00:00Z' } } });
const backendCheckout = () =>
  client.POST('/api/v1/checkout-sessions', {
    body: {
      subject: 'm',
      lines: [{ product: 'p', quantity: 1, sku: 's' }],
      success_url: 'https://example.com/ok',
      cancel_url: 'https://example.com/no',
    },
  });
type CheckoutRefusal = NonNullable<Awaited<ReturnType<typeof backendCheckout>>['error']>;

export type CatalogueChecks = [
  Assert<Equal<Product['sku_prices'], ProductSkuPrice[]>>,
  Assert<Equal<ProductSkuPrice['interval'], 'month' | 'year' | null>>,
  Assert<Equal<BackendClient['store_currency'], string>>,
  Assert<Equal<Data<typeof listEntitlements>, ListedAccountStatePage>>,
  Assert<Equal<ListedAccountStatePage['next_changed_since'], string>>,
  // The 409 for an order still waiting on its payment says where the member finishes paying it.
  Assert<Equal<Extract<CheckoutRefusal, { order?: string }>['payment_url'], string | null | undefined>>,
];

// The client fills the Idempotency-Key of a keyed create, so the caller may leave it out or pass one.
export const keyed = () => client.POST('/api/v1/articles', { body: { title: 't', content: 'c' } });
export const ownKey = () =>
  client.POST('/api/v1/articles', {
    params: { header: { 'Idempotency-Key': 'k' } },
    body: { title: 't', content: 'c' },
  });

// @ts-expect-error an unknown path is a compile error, not a runtime 404
export const unknownPath = () => client.GET('/api/v1/nothing-here');
// @ts-expect-error a path parameter of the wrong type is a compile error
export const wrongId = () => client.GET('/api/v1/articles/{id}', { params: { path: { id: 1 } } });
// @ts-expect-error page-number paging is refused by the API, so it is a compile error
export const pageNumber = () => client.GET('/api/v1/articles', { params: { query: { per_page: 5 } } });

test('the type assertions in this file compile', () => {});
