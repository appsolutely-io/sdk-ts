// Compile-time assertions, checked by `pnpm typecheck`: the response data of the documented
// resources is their model type, never `any`.
import { test } from 'node:test';
import {
  createClient,
  type Article,
  type ApiError,
  type FormEntry,
  type Order,
  type Page,
  type PaginationMeta,
  type Product,
} from '../src/index.ts';
import type { IsAny } from './support/types.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const client = createClient({ baseUrl: 'https://example.com', token: 't' });
type Data<T extends (...args: never[]) => Promise<{ data?: unknown }>> = NonNullable<Awaited<ReturnType<T>>['data']>;

const listArticles = () => client.GET('/api/v1/articles');
const getArticle = () => client.GET('/api/v1/articles/{id}', { params: { path: { id: 1 } } });
const getPage = () => client.GET('/api/v1/pages/{id}', { params: { path: { id: 1 } } });
const getProduct = () => client.GET('/api/v1/products/{id}', { params: { path: { id: 1 } } });
const getOrder = () => client.GET('/api/v1/orders/{id}', { params: { path: { id: 1 } } });
const getFormEntry = () => client.GET('/api/v1/form-entries/{id}', { params: { path: { id: 1 } } });
const refused = async () => (await client.GET('/api/v1/articles')).error;

export type Checks = [
  Assert<Equal<IsAny<Data<typeof listArticles>['data']>, false>>,
  Assert<Equal<Data<typeof listArticles>['data'], Article[]>>,
  Assert<Equal<Data<typeof listArticles>['meta'], PaginationMeta>>,
  Assert<Equal<Data<typeof getArticle>['data'], Article>>,
  Assert<Equal<Data<typeof getPage>['data'], Page>>,
  Assert<Equal<Data<typeof getProduct>['data'], Product>>,
  Assert<Equal<Data<typeof getOrder>['data'], Order>>,
  Assert<Equal<Data<typeof getFormEntry>['data'], FormEntry>>,
  Assert<Equal<IsAny<Article['id']>, false>>,
  Assert<Equal<NonNullable<Awaited<ReturnType<typeof refused>>>, ApiError>>,
];

// @ts-expect-error an unknown path is a compile error, not a runtime 404
export const unknownPath = () => client.GET('/api/v1/nothing-here');
// @ts-expect-error a path parameter of the wrong type is a compile error
export const wrongId = () => client.GET('/api/v1/articles/{id}', { params: { path: { id: 'one' } } });

test('the type assertions in this file compile', () => {});
