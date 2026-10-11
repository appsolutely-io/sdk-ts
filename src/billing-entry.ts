import type { AppsolutelyClient } from './client.ts';
import type { BillingEntry, operations } from './generated/schema.ts';

/** What an app sends to ask for its "Manage billing" entry. */
export type BillingEntryQuery = operations['getMeBillingEntry']['parameters']['query'];

type Responses = operations['getMeBillingEntry']['responses'];

/** A refusal of the billing entry read: the problem document its status carries. */
export type BillingEntryProblem = {
  [Status in keyof Responses]: Responses[Status] extends { content: { 'application/problem+json': infer Problem } }
    ? Problem
    : never;
}[keyof Responses];

/** The entry when it appears, `null` when it does not, or the refusal. */
export type BillingEntryAnswer =
  | { entry: BillingEntry | null; error: undefined; response: Response }
  | { entry: undefined; error: BillingEntryProblem; response: Response };

/**
 * Asks whether the app shows "Manage billing" here, and how.
 *
 * `entry` is the answer when the entry appears and `null` when it does not.
 * The opening is the platform's: `presentation` names it, and a plain link
 * opens in the system browser, never a web view. When `needs_store_token`
 * is true the store requires a token of its own first (StoreKit's
 * `ExternalPurchaseCustomLink`, Play Billing's reporting details); ask again
 * with it as `store_token` to get the address. A refusal is in `error`.
 */
export async function billingEntry(client: AppsolutelyClient, query: BillingEntryQuery): Promise<BillingEntryAnswer> {
  const { data, error, response } = await client.GET('/api/v1/me/billing-entry', { params: { query } });

  if (data === undefined) {
    return { entry: undefined, error, response };
  }

  return { entry: data.available ? data : null, error: undefined, response };
}
