/**
 * The marketplace's and the transfer sheet's calls (ledger 0402). The route
 * builds them over the caller's own browser client, so every call is the
 * student's own session; the dev harness answers them in memory. An omitted
 * transport removes the control it drives (absence is the mechanism).
 *
 * Every answer comes back as `{ ok: true, data }` or `{ ok: false, words }`:
 * a refusal is said in a student's words, a missing function (the migration
 * not applied yet) says so, and a thrown network error never escapes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callV2, V2_UNAVAILABLE } from '$lib/coin-desk/v2';
import { marketRefusalWords, transferRefusalWords } from './market';

export type Outcome<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; words: string; raw?: Record<string, unknown> };

export interface MarketTransports {
	post?: (input: {
		kind: 'offer' | 'request';
		title: string;
		description: string;
		price: number;
		category: string;
		quantity: number | null;
		photoPath: string | null;
	}) => Promise<Outcome>;
	uploadPhoto?: (file: File) => Promise<{ ok: true; path: string } | { ok: false; words: string }>;
	listingSet?: (listingId: string, action: 'withdraw' | 'renew') => Promise<Outcome>;
	claim?: (listingId: string) => Promise<Outcome>;
	orderAct?: (orderId: string, action: 'deliver' | 'cancel' | 'confirm' | 'dispute', reason?: string) => Promise<Outcome>;
	review?: (orderId: string, stars: number, body: string) => Promise<Outcome>;
	profile?: (studentId: string) => Promise<Outcome<unknown>>;
}

export interface TransferTransports {
	status: () => Promise<Outcome<unknown>>;
	directory: () => Promise<Outcome<unknown>>;
	setPin?: (pin: string, oldPin: string | null) => Promise<Outcome>;
	send?: (input: { to: string; amount: number; message: string | null; private: boolean; pin: string }) => Promise<Outcome>;
}

async function rpcOutcome(
	supabase: SupabaseClient,
	fn: string,
	params: Record<string, unknown>,
	words: (r: Record<string, unknown>) => string = marketRefusalWords
): Promise<Outcome> {
	const r = await callV2<Record<string, unknown>>(supabase, fn, params);
	if (r.kind === 'missing') return { ok: false, words: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, words: r.message || 'That did not go through. Try again in a minute.' };
	if (!r.data || r.data.ok !== true) return { ok: false, words: words(r.data ?? {}), raw: r.data ?? {} };
	return { ok: true, data: r.data };
}

async function rpcRead(supabase: SupabaseClient, fn: string, params: Record<string, unknown> = {}): Promise<Outcome<unknown>> {
	const r = await callV2<unknown>(supabase, fn, params);
	if (r.kind === 'missing') return { ok: false, words: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, words: r.message || 'That could not be read. Try again in a minute.' };
	return { ok: true, data: r.data };
}

export function createMarketTransports(
	supabase: SupabaseClient,
	upload: ((file: File) => Promise<{ ok: true; path: string } | { ok: false; words: string }>) | null
): MarketTransports {
	return {
		post: (i) =>
			rpcOutcome(supabase, 'coin_market_post', {
				p_kind: i.kind,
				p_title: i.title,
				p_description: i.description,
				p_price: i.price,
				p_category: i.category,
				p_quantity: i.quantity,
				p_photo_path: i.photoPath
			}),
		uploadPhoto: upload ?? undefined,
		listingSet: (id, action) => rpcOutcome(supabase, 'coin_market_listing_set', { p_listing_id: id, p_action: action }),
		claim: (id) => rpcOutcome(supabase, 'coin_market_claim', { p_listing_id: id }),
		orderAct: (id, action, reason) =>
			rpcOutcome(supabase, 'coin_market_order_act', { p_order_id: id, p_action: action, p_reason: reason ?? null }),
		review: (id, stars, body) => rpcOutcome(supabase, 'coin_market_review', { p_order_id: id, p_stars: stars, p_body: body }),
		profile: (id) => rpcRead(supabase, 'coin_market_profile', { p_student_id: id })
	};
}

export function createTransferTransports(supabase: SupabaseClient): TransferTransports {
	return {
		status: () => rpcRead(supabase, 'coin_transfer_status'),
		directory: () => rpcRead(supabase, 'coin_transfer_directory'),
		setPin: (pin, oldPin) =>
			rpcOutcome(supabase, 'coin_transfer_pin_set', { p_pin: pin, p_old_pin: oldPin }, transferRefusalWords),
		send: (i) =>
			rpcOutcome(
				supabase,
				'coin_transfer_send',
				{ p_to: i.to, p_amount: i.amount, p_message: i.message, p_private: i.private, p_pin: i.pin },
				transferRefusalWords
			)
	};
}
