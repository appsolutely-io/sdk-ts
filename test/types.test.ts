// Compile-time assertions, checked by `pnpm typecheck`: the response data of the documented
// resources is their model type, never `any`, and a refusal is a problem document typed by its `type`.
import { test } from 'node:test';
import {
  createClient,
  type operations,
  type AccountState,
  type BackendClient,
  type Fulfilment,
  type ListedAccountState,
  type ListedAccountStatePage,
  type Member,
  type MemberTerms,
  type Order,
  type Problem,
  type Product,
  type ProductPage,
  type ProductSkuPrice,
  type OrderPaidEvent,
  type Seat,
  type SeatPool,
  type StoreSeatPayload,
  type StoreMeOrganisationSeatPayload,
} from '../src/index.ts';
import type { IsAny } from './support/types.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
// Flattens an intersection, so an `allOf` schema compares equal to the same shape written out.
type Flat<T> = { [K in keyof T]: T[K] };

const client = createClient({ baseUrl: 'https://example.com', token: 't' });
type Data<T extends (...args: never[]) => Promise<{ data?: unknown }>> = NonNullable<Awaited<ReturnType<T>>['data']>;

const listProducts = () => client.GET('/api/v1/products');
const getProduct = () => client.GET('/api/v1/products/{id}', { params: { path: { id: '1' } } });
const getOrder = () => client.GET('/api/v1/me/orders/{id}', { params: { path: { id: '1' } } });
const fulfil = () => client.POST('/api/v1/fulfilments', { body: { token: 't', delivery_payload: 'p' } });
const refused = async () => (await client.GET('/api/v1/products')).error;
type Refusal = NonNullable<Awaited<ReturnType<typeof refused>>>;

export type Checks = [
  Assert<Equal<IsAny<Data<typeof listProducts>['data']>, false>>,
  Assert<Equal<Data<typeof listProducts>, ProductPage>>,
  Assert<Equal<Data<typeof listProducts>['data'], Product[]>>,
  Assert<Equal<ProductPage['next_cursor'], string | undefined>>,
  Assert<Equal<Data<typeof getProduct>, Product>>,
  Assert<Equal<Data<typeof getOrder>, Order>>,
  Assert<Equal<Data<typeof fulfil>, Fulfilment>>,
  Assert<Equal<Product['id'], string>>,
  Assert<Refusal extends Problem ? true : false>,
  Assert<Equal<IsAny<Refusal['type']>, false>>,
  // Narrowed to the documented type URIs, so a branch on a misspelt one is a compile error.
  Assert<string extends Refusal['type'] ? false : true>,
  Assert<'https://appsolutely.io/problems/unauthenticated' extends Refusal['type'] ? true : false>,
];

export type NullableResponseChecks = [
  Assert<Equal<Order['tax_amount'], number | null | undefined>>,
  Assert<Equal<Order['total_amount'], number | null | undefined>>,
  Assert<Equal<Data<typeof getOrder>['tax_amount'], number | null | undefined>>,
  Assert<Equal<Data<typeof getOrder>['total_amount'], number | null | undefined>>,
  Assert<Equal<OrderPaidEvent['data']['tax_amount'], number | null | undefined>>,
  Assert<Equal<OrderPaidEvent['data']['total_amount'], number | null | undefined>>,
  Assert<Equal<Seat['member'], string | null | undefined>>,
  Assert<Equal<SeatPool['seats'][number]['member'], string | null | undefined>>,
  Assert<Equal<StoreSeatPayload['member'], string>>,
  Assert<Equal<StoreMeOrganisationSeatPayload['member'], string>>,
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
  Assert<Equal<Flat<Data<typeof listEntitlements>['data'][number]>, Flat<ListedAccountState>>>,
  Assert<Equal<Omit<Data<typeof listEntitlements>, 'data'>, Omit<ListedAccountStatePage, 'data'>>>,
  Assert<Equal<ListedAccountStatePage['next_changed_since'], string>>,
  // The 409 for an order still waiting on its payment says where the member finishes paying it.
  Assert<Equal<Extract<CheckoutRefusal, { order?: string }>['payment_url'], string | null | undefined>>,
];

// A member's terms acceptance, integer entitlement totals, and the refusals aio 0.27.0 changed.
const exchangeMagicLink = async () =>
  (await client.POST('/api/v1/auth/magic-link/token', { body: { link: 'l', code_verifier: 'v' } })).error;
type MagicLinkRefusal = NonNullable<Awaited<ReturnType<typeof exchangeMagicLink>>>;

export type CurrentChecks = [
  Assert<Equal<Member['terms'], MemberTerms>>,
  Assert<Equal<MemberTerms['accepted'], boolean>>,
  Assert<Equal<AccountState['totals'], Record<string, number>>>,
  Assert<Equal<Flat<ListedAccountState>['entitlements_changed_at'], string>>,
  Assert<'https://appsolutely.io/problems/second-factor-required' extends MagicLinkRefusal['type'] ? true : false>,
  Assert<'https://appsolutely.io/problems/rate-limited' extends MagicLinkRefusal['type'] ? true : false>,
];

export const changeWithoutReturnUrl = () =>
  client.POST('/api/v1/me/subscriptions/{subscription}/changes', {
    params: { path: { subscription: 's' } },
    // @ts-expect-error a subscription change names the address the member returns to after confirming it
    body: { sku: 'team' },
  });

// The client fills the Idempotency-Key of a keyed create, so the caller may leave it out or pass one.
export const keyed = () => client.POST('/api/v1/me/addresses', { body: { name: 'n', address: 'a' } });
export const ownKey = () =>
  client.POST('/api/v1/me/addresses', {
    params: { header: { 'Idempotency-Key': 'k' } },
    body: { name: 'n', address: 'a' },
  });

// @ts-expect-error an unknown path is a compile error, not a runtime 404
export const unknownPath = () => client.GET('/api/v1/nothing-here');
// @ts-expect-error a path parameter of the wrong type is a compile error
export const wrongId = () => client.GET('/api/v1/products/{id}', { params: { path: { id: 1 } } });
// @ts-expect-error page-number paging is refused by the API, so it is a compile error
export const pageNumber = () => client.GET('/api/v1/products', { params: { query: { per_page: 5 } } });

test('the type assertions in this file compile', () => {});

export type ResumptionRefusalCheck = Assert<
  'https://appsolutely.io/problems/subscription-change-refused' extends NonNullable<
    operations['resumeMeSubscription']['responses'][409]['content']['application/problem+json']['type']
  >
    ? true
    : false
>;

// @ts-expect-error administrator pages are served by the Administrator API
export const retiredPages = () => client.GET('/api/v1/pages');
// @ts-expect-error administrator article writes are served by the Administrator API
export const retiredArticle = () => client.POST('/api/v1/articles', { body: {} });
