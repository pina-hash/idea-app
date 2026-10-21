/**
 * The Coin Desk market page's calls (ledger 0402). The route builds them over
 * the staff member's own client; every function re-checks coin staff and
 * scope in the database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callV2, V2_UNAVAILABLE } from '$lib/coin-desk/v2';
import type { BannerKind } from './banner';
import { marketRefusalWords } from './market';

export interface MarketDeskTransports {
	load: () => Promise<{ moderation: unknown; banner: unknown; transfers: unknown; stocks: unknown; sections: unknown; cards?: unknown }>;
	resolve: (orderId: string, outcome: 'release' | 'refund' | 'split', toPayee: number | null, note: string | null) => Promise<DeskResult>;
	listing: (listingId: string, action: 'feature' | 'unfeature' | 'hide' | 'unhide' | 'remove', reason: string | null) => Promise<DeskResult>;
	reviewRemove: (reviewId: string, reason: string) => Promise<DeskResult>;
	official: (input: { id: string | null; title: string; description: string; link: string; price: number | null; sectionId: string | null; days: number }) => Promise<DeskResult>;
	bannerSave: (input: { id: string | null; kind: BannerKind; listingId: string | null; title: string; subtitle: string; href: string; startsOn: string | null; endsOn: string | null; sectionId: string | null; sort: number }) => Promise<DeskResult>;
	bannerRemove: (pinId: string) => Promise<DeskResult>;
	transferRemove: (transferId: string, reason: string) => Promise<DeskResult>;
	stockSet?: (stockId: string, active: boolean) => Promise<DeskResult>;
	/** Ledger 0425 (0294): feature or unfeature any market card by its card id. */
	cardFeature?: (card: string, featured: boolean) => Promise<DeskResult>;
}
export type DeskResult = { ok: true } | { ok: false; words: string };

/** One card on the market, as `coin_market_cards_admin()` lists it (0294). */
export interface MarketCard {
	card: string;
	kind: 'official' | 'listing' | 'donation' | 'contract' | 'shop' | 'background';
	title: string;
	detail: string;
	featured: boolean;
	hidden: boolean;
	canSet: boolean;
}
const CARD_KINDS = new Set<MarketCard['kind']>(['official', 'listing', 'donation', 'contract', 'shop', 'background']);

export function parseMarketCards(raw: unknown): MarketCard[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((x) => {
		const o = (x ?? {}) as Record<string, unknown>;
		const kind = String(o.kind ?? '') as MarketCard['kind'];
		const card = typeof o.card === 'string' ? o.card : '';
		if (!card || !CARD_KINDS.has(kind)) return [];
		return [{ card, kind, title: String(o.title ?? ''), detail: String(o.detail ?? ''), featured: o.featured === true, hidden: o.hidden === true, canSet: o.can_set === true }];
	});
}

/** The kind of card in words, for the desk's list. */
export const CARD_KIND_WORDS: Record<MarketCard['kind'], string> = {
	official: 'Official card',
	listing: 'Student listing',
	donation: 'Want-ad',
	contract: 'Contract',
	shop: 'Shop',
	background: 'Background'
};

const CARD_WORDS: Record<string, string> = {
	not_found: 'That card is not on the market any more. Reload.',
	full_admin_only: 'Only a full coin admin can feature a card every class sees.'
};

const STAFF_WORDS: Record<string, string> = {
	outcome: 'Pick pay, refund or split.',
	split_amount: 'A split pays the seller more than nothing and less than everything.',
	not_found: 'That is not one of yours, or it is gone. Reload.',
	not_open: 'That trade is already settled.',
	hide_reason: 'Say why it is hidden (3 to 300 characters). The student sees it.',
	remove_reason: 'Say why (3 to 300 characters).',
	full_admin_only: 'Only a full coin admin can post for every class. Pick a class.',
	link: 'A link is a page on this site, starting with a single /.',
	href: 'A link is a page on this site, starting with a single /.',
	title: 'A title is 2 to 80 characters.',
	dates: 'The end date is before the start date.',
	listing: 'That listing is gone.',
	days: 'Days up is 1 to 365.',
	price: 'A price is 0.1 to 1000.',
	params: 'Those numbers were not accepted.'
};

async function staffCall(supabase: SupabaseClient, fn: string, params: Record<string, unknown>, words: Record<string, string> = STAFF_WORDS): Promise<DeskResult> {
	const r = await callV2<Record<string, unknown>>(supabase, fn, params);
	if (r.kind === 'missing') return { ok: false, words: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, words: r.message || 'That did not go through.' };
	if (!r.data || r.data.ok !== true) {
		const reason = String(r.data?.reason ?? '');
		return { ok: false, words: words[reason] ?? STAFF_WORDS[reason] ?? marketRefusalWords(r.data) };
	}
	return { ok: true };
}

async function soft(supabase: SupabaseClient, fn: string, params: Record<string, unknown> = {}): Promise<unknown> {
	const r = await callV2<unknown>(supabase, fn, params);
	return r.kind === 'ok' ? r.data : null;
}

export function createMarketDeskTransports(supabase: SupabaseClient, full: boolean): MarketDeskTransports {
	return {
		load: async () => {
			const [moderation, banner, transfers, stocks, sections, cards] = await Promise.all([
				soft(supabase, 'coin_market_moderation'),
				soft(supabase, 'coin_banner_admin'),
				soft(supabase, 'coin_transfer_moderation'),
				full ? soft(supabase, 'coin_stock_admin_list') : Promise.resolve(null),
				soft(supabase, 'coin_fine_sections'),
				soft(supabase, 'coin_market_cards_admin')
			]);
			return { moderation, banner, transfers, stocks, sections, cards };
		},
		resolve: (id, outcome, toPayee, note) =>
			staffCall(supabase, 'coin_market_resolve', { p_order_id: id, p_outcome: outcome, p_to_payee: toPayee, p_note: note }),
		listing: (id, action, reason) => staffCall(supabase, 'coin_market_listing_staff', { p_listing_id: id, p_action: action, p_reason: reason }),
		reviewRemove: (id, reason) => staffCall(supabase, 'coin_market_review_remove', { p_review_id: id, p_reason: reason }),
		official: (i) =>
			staffCall(supabase, 'coin_market_official_save', {
				p_id: i.id,
				p_title: i.title,
				p_description: i.description,
				p_link: i.link,
				p_price: i.price,
				p_section_id: i.sectionId,
				p_days: i.days
			}),
		bannerSave: (i) =>
			staffCall(supabase, 'coin_banner_save', {
				p_id: i.id,
				p_kind: i.kind,
				p_listing_id: i.listingId,
				p_title: i.title,
				p_subtitle: i.subtitle,
				p_href: i.href,
				p_starts_on: i.startsOn,
				p_ends_on: i.endsOn,
				p_section_id: i.sectionId,
				p_sort_order: i.sort
			}),
		bannerRemove: (id) => staffCall(supabase, 'coin_banner_remove', { p_id: id }),
		transferRemove: (id, reason) => staffCall(supabase, 'coin_transfer_remove_message', { p_transfer_id: id, p_reason: reason }),
		cardFeature: (card, featured) => staffCall(supabase, 'coin_market_card_set_featured', { p_card: card, p_featured: featured }, CARD_WORDS),
		stockSet: full ? (id, active) => staffCall(supabase, 'coin_stock_admin_set', { p_stock_id: id, p_active: active, p_params: null }) : undefined
	};
}
