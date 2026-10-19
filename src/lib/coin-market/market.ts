/**
 * THE IDEA COIN MARKETPLACE AND TRANSFERS (ledger 0402, migrations 0276 and
 * 0277): plain types, parsers and words, client-safe. The database is the
 * rule; everything here only reads its answers and says them in a student's
 * terms. Every refusal a market or transfer function can give has one
 * sentence below, and a reason this file does not know falls back to a
 * sentence that is still true.
 *
 * NO ADDRESS EVER REACHES THIS MODULE: a person is `{ id, name }`, the
 * Ledger's opaque public id and the roster name.
 */

import { coinNumber, coins } from '$lib/coin-format';

export type ListingKind = 'offer' | 'request' | 'official';
export type OrderStatus = 'held' | 'delivered' | 'disputed' | 'released' | 'refunded' | 'split';

export const MARKET_CATEGORIES = [
	{ id: 'service', label: 'Service' },
	{ id: 'product', label: 'Product' },
	{ id: 'tutoring', label: 'Tutoring' },
	{ id: 'design', label: 'Design' },
	{ id: 'fabrication', label: 'Fabrication' },
	{ id: 'other', label: 'Other' }
] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number]['id'];

export function categoryLabel(id: string): string {
	return MARKET_CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
}

export interface PersonRef {
	id: string;
	name: string;
}
export interface ClassRef {
	section_id: string;
	label: string;
}
export interface Rating {
	average: number | null;
	count: number;
}

export interface Listing {
	id: string;
	zone: 'student' | 'official';
	kind: ListingKind;
	title: string;
	description: string;
	price: number | null;
	category: string;
	quantity: number | null;
	remaining: number;
	photo_path: string | null;
	photo_url?: string | null;
	link: string | null;
	section_id: string | null;
	section: string | null;
	featured: boolean;
	hidden: boolean;
	hidden_reason: string | null;
	closed: boolean;
	closed_reason: string | null;
	expired: boolean;
	expires_at: string;
	created_at: string;
	mine: boolean;
	owner: { id?: string; name: string; classes?: ClassRef[]; rating?: Rating };
}

export interface Order {
	id: string;
	listing_id: string;
	title: string;
	kind: ListingKind;
	amount: number;
	status: OrderStatus;
	side: 'payer' | 'payee' | null;
	other: PersonRef;
	created_at: string;
	delivered_at: string | null;
	disputed_at: string | null;
	dispute_reason: string | null;
	settled_at: string | null;
	to_payee: number | null;
	fee: number | null;
	resolution_note: string | null;
	class_days_since_delivery: number | null;
	auto_release_days: number;
	can_deliver: boolean;
	can_cancel: boolean;
	can_confirm: boolean;
	can_dispute: boolean;
	can_review: boolean;
	my_review: { id: string; stars: number; body: string; created_at: string; removed: boolean } | null;
}

export interface MarketRules {
	fee_percent: number;
	max_open: number;
	listing_days: number;
	auto_release_days: number;
	review_min_chars: number;
	review_edit_hours: number;
}

export interface MarketBoard {
	in_economy: boolean;
	staff: boolean;
	me: { id: string; name: string; balance: number; open_listings: number };
	rules: MarketRules;
	listings: Listing[];
	official: Listing[];
	orders: Order[];
}

export interface Review {
	id: string;
	stars: number;
	body: string;
	at: string;
	author: string;
}

export interface MarketProfile {
	id: string;
	name: string;
	classes: ClassRef[];
	rating: Rating;
	reviews: Review[];
	listings: Listing[];
}

// ---------------------------------------------------------------------------
// Parsing. Lenient on numbers (PostgREST may send a numeric as a string),
// strict on the shape: an answer without the keys a surface reads is null.
// ---------------------------------------------------------------------------

function n(v: unknown, d = 0): number {
	const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(x) ? x : d;
}
function nn(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const x = n(v, NaN);
	return Number.isFinite(x) ? x : null;
}
function s(v: unknown, d = ''): string {
	return typeof v === 'string' ? v : d;
}
function sn(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function obj(v: unknown): Record<string, unknown> | null {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function arr(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}

function parseRating(v: unknown): Rating {
	const o = obj(v);
	return { average: nn(o?.average), count: n(o?.count) };
}
function parseClasses(v: unknown): ClassRef[] {
	return arr(v)
		.map(obj)
		.filter((c): c is Record<string, unknown> => !!c)
		.map((c) => ({ section_id: s(c.section_id), label: s(c.label) }));
}

export function parseListing(v: unknown): Listing | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string' || typeof o.title !== 'string') return null;
	const owner = obj(o.owner) ?? {};
	const kind = (['offer', 'request', 'official'].includes(String(o.kind)) ? o.kind : 'offer') as ListingKind;
	return {
		id: o.id,
		zone: o.zone === 'official' ? 'official' : 'student',
		kind,
		title: o.title,
		description: s(o.description),
		price: nn(o.price),
		category: s(o.category, 'other'),
		quantity: nn(o.quantity),
		remaining: n(o.remaining, 0),
		photo_path: sn(o.photo_path),
		photo_url: sn(o.photo_url),
		link: sn(o.link),
		section_id: sn(o.section_id),
		section: sn(o.section),
		featured: o.featured === true,
		hidden: o.hidden === true,
		hidden_reason: sn(o.hidden_reason),
		closed: o.closed === true,
		closed_reason: sn(o.closed_reason),
		expired: o.expired === true,
		expires_at: s(o.expires_at),
		created_at: s(o.created_at),
		mine: o.mine === true,
		owner: {
			id: sn(owner.id) ?? undefined,
			name: s(owner.name, 'A student'),
			classes: parseClasses(owner.classes),
			rating: owner.rating ? parseRating(owner.rating) : undefined
		}
	};
}

export function parseOrder(v: unknown): Order | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string') return null;
	const other = obj(o.other) ?? {};
	const mr = obj(o.my_review);
	const status = (['held', 'delivered', 'disputed', 'released', 'refunded', 'split'].includes(String(o.status))
		? o.status
		: 'held') as OrderStatus;
	return {
		id: o.id,
		listing_id: s(o.listing_id),
		title: s(o.title, 'A listing'),
		kind: (o.kind === 'request' ? 'request' : 'offer') as ListingKind,
		amount: n(o.amount),
		status,
		side: o.side === 'payer' || o.side === 'payee' ? o.side : null,
		other: { id: s(other.id), name: s(other.name, 'A student') },
		created_at: s(o.created_at),
		delivered_at: sn(o.delivered_at),
		disputed_at: sn(o.disputed_at),
		dispute_reason: sn(o.dispute_reason),
		settled_at: sn(o.settled_at),
		to_payee: nn(o.to_payee),
		fee: nn(o.fee),
		resolution_note: sn(o.resolution_note),
		class_days_since_delivery: nn(o.class_days_since_delivery),
		auto_release_days: n(o.auto_release_days, 5),
		can_deliver: o.can_deliver === true,
		can_cancel: o.can_cancel === true,
		can_confirm: o.can_confirm === true,
		can_dispute: o.can_dispute === true,
		can_review: o.can_review === true,
		my_review: mr
			? { id: s(mr.id), stars: n(mr.stars), body: s(mr.body), created_at: s(mr.created_at), removed: mr.removed === true }
			: null
	};
}

export function parseBoard(v: unknown): MarketBoard | null {
	const o = obj(v);
	if (!o || o.signed_in !== true) return null;
	const me = obj(o.me) ?? {};
	const rules = obj(o.rules) ?? {};
	return {
		in_economy: o.in_economy === true,
		staff: o.staff === true,
		me: { id: s(me.id), name: s(me.name), balance: n(me.balance), open_listings: n(me.open_listings) },
		rules: {
			fee_percent: n(rules.fee_percent, 0),
			max_open: n(rules.max_open, 5),
			listing_days: n(rules.listing_days, 14),
			auto_release_days: n(rules.auto_release_days, 5),
			review_min_chars: n(rules.review_min_chars, 20),
			review_edit_hours: n(rules.review_edit_hours, 24)
		},
		listings: arr(o.listings).map(parseListing).filter((l): l is Listing => !!l),
		official: arr(o.official).map(parseListing).filter((l): l is Listing => !!l),
		orders: arr(o.orders).map(parseOrder).filter((x): x is Order => !!x)
	};
}

export function parseProfile(v: unknown): MarketProfile | null {
	const o = obj(v);
	if (!o || o.ok !== true) return null;
	return {
		id: s(o.id),
		name: s(o.name, 'A student'),
		classes: parseClasses(o.classes),
		rating: parseRating(o.rating),
		reviews: arr(o.reviews)
			.map(obj)
			.filter((r): r is Record<string, unknown> => !!r)
			.map((r) => ({ id: s(r.id), stars: n(r.stars), body: s(r.body), at: s(r.at), author: s(r.author, 'A student') })),
		listings: arr(o.listings).map(parseListing).filter((l): l is Listing => !!l)
	};
}

// ---------------------------------------------------------------------------
// The board, sorted and filtered on the page (the board is the whole list).
// ---------------------------------------------------------------------------

export interface BoardFilter {
	query: string;
	sectionId: string;
	category: string;
	kind: '' | 'offer' | 'request';
}

/** Open listings first, featured first, newest first; the filter matches words in the title, description or name. */
export function filterListings(listings: Listing[], f: BoardFilter): Listing[] {
	const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
	return listings.filter((l) => {
		if (f.kind && l.kind !== f.kind) return false;
		if (f.category && l.category !== f.category) return false;
		if (f.sectionId && !(l.owner.classes ?? []).some((c) => c.section_id === f.sectionId)) return false;
		if (!words.length) return true;
		const hay = `${l.title} ${l.description} ${l.owner.name}`.toLowerCase();
		return words.every((w) => hay.includes(w));
	});
}

/** Every class named on the board, for the class filter. */
export function boardClasses(listings: Listing[]): ClassRef[] {
	const seen = new Map<string, ClassRef>();
	for (const l of listings) for (const c of l.owner.classes ?? []) if (!seen.has(c.section_id)) seen.set(c.section_id, c);
	return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** A listing anyone but its poster can still claim. */
export function claimable(l: Listing): boolean {
	return l.zone === 'student' && !l.mine && !l.closed && !l.hidden && !l.expired && l.remaining > 0;
}

// ---------------------------------------------------------------------------
// Words.
// ---------------------------------------------------------------------------

export const ORDER_STATUS_WORDS: Record<OrderStatus, { label: string; tone: 'wait' | 'good' | 'bad' | 'plain' }> = {
	held: { label: 'Coins held', tone: 'wait' },
	delivered: { label: 'Marked done', tone: 'wait' },
	disputed: { label: 'Disputed', tone: 'bad' },
	released: { label: 'Paid', tone: 'good' },
	refunded: { label: 'Refunded', tone: 'plain' },
	split: { label: 'Split by staff', tone: 'plain' }
};

/** What the next step is, said to the person looking. */
export function orderNextStep(o: Order): string {
	const payer = o.side === 'payer';
	switch (o.status) {
		case 'held':
			return payer
				? `Your ${coins(o.amount)} is held. ${o.other.name} marks it done when it is delivered.`
				: `${o.other.name}'s ${coins(o.amount)} is held for you. Deliver, then mark it done.`;
		case 'delivered': {
			const left = Math.max(o.auto_release_days - (o.class_days_since_delivery ?? 0), 0);
			return payer
				? `Marked done. Confirm if you got it, or dispute. It pays out on its own in ${left} class day${left === 1 ? '' : 's'}.`
				: `Marked done. ${o.other.name} confirms, or it pays you on its own in ${left} class day${left === 1 ? '' : 's'}.`;
		}
		case 'disputed':
			return 'Disputed. Staff will decide: pay it, refund it, or split it.';
		case 'released':
			return payer ? `Paid to ${o.other.name}.` : `You were paid ${coins((o.to_payee ?? o.amount) - (o.fee ?? 0))}.`;
		case 'refunded':
			return payer ? `Your ${coins(o.amount)} came back to you.` : `Refunded to ${o.other.name}.`;
		case 'split':
			return `Staff split it: ${coins(o.to_payee ?? 0)} to the seller, the rest back to the buyer.`;
	}
}

/** A market or transfer refusal, in a student's words. */
export function marketRefusalWords(r: Record<string, unknown> | null | undefined): string {
	const reason = String(r?.reason ?? '');
	switch (reason) {
		case 'signed_out':
			return 'You are signed out. Sign in again, then try once more.';
		case 'not_in_economy':
			return 'None of your classes is using IDEA Coins right now.';
		case 'rate_limited':
			return 'That is a lot in one minute. Wait a minute, then try again.';
		case 'insufficient': {
			const cost = nn(r?.cost);
			const bal = nn(r?.balance);
			return cost !== null && bal !== null
				? `This needs ${coins(cost)} and your balance is ${coins(bal)}. It has to leave you at ${coins(0)} or more.`
				: `Your balance is too low. It has to leave you at ${coins(0)} or more.`;
		}
		case 'in_debt':
			return 'You are in debt, so you cannot spend coins until your balance is back to zero. You can still sell and receive.';
		case 'poster_cannot_pay':
			return 'The student who posted this request cannot pay for it right now, so it cannot be taken.';
		case 'kind':
			return 'Pick Offer or Request.';
		case 'title':
			return 'Give it a title of 3 to 80 characters.';
		case 'description':
			return 'Keep the description under 1000 characters.';
		case 'price':
			return `Set a price from ${coins(0.1)} to ${coins(1000)}, with at most two decimals.`;
		case 'category':
			return 'Pick a category.';
		case 'quantity':
			return 'A quantity is 1 to 50, or leave it as one time.';
		case 'photo':
			return 'That photo did not upload. Pick it again.';
		case 'too_many':
			return `You already have ${coinNumber(n(r?.max, 5))} open listings. Close or let one expire first.`;
		case 'not_found':
			return 'That is not there any more. Reload the page.';
		case 'closed':
			return 'That listing is closed.';
		case 'hidden':
			return 'Staff hid that listing, so it cannot be renewed.';
		case 'own_listing':
			return 'That is your own listing.';
		case 'not_open':
			return 'That listing is not open any more.';
		case 'not_now':
			return 'That step does not fit where this trade is now. Reload to see its state.';
		case 'dispute_reason':
			return 'Say in a few words what went wrong (3 to 500 characters).';
		case 'stars':
			return 'Pick 1 to 5 stars.';
		case 'body':
			return `Write at least ${coinNumber(n(r?.min, 20))} characters.`;
		case 'not_released':
			return 'Only a trade that was paid out can be reviewed.';
		case 'locked':
			return 'A review can be changed only for a day after you write it.';
		case 'removed':
			return 'Staff removed your review of this trade.';
		case 'already_reviewed':
			return 'You already reviewed this trade.';
		// Transfers.
		case 'pin_shape':
			return 'A PIN is 4 to 6 digits.';
		case 'no_pin':
			return 'Set your transfer PIN first.';
		case 'wrong_pin': {
			const left = nn(r?.tries_left);
			return left !== null ? `Wrong PIN. ${left} tr${left === 1 ? 'y' : 'ies'} left before sending locks.` : 'Wrong PIN.';
		}
		case 'locked_pin':
		case 'pin_locked':
			return 'Sending is locked for now after too many wrong PINs.';
		case 'amount':
			return `Send from ${coins(0.1)} up, with at most two decimals.`;
		case 'message':
			return 'Keep the message to 200 characters.';
		case 'recipient':
			return 'Pick a student in the IDEA Coin economy.';
		case 'self':
			return 'You cannot send coins to yourself.';
		case 'cap': {
			const room = nn(r?.room);
			return room !== null
				? `That is over today's sending limit. You can send ${coins(room)} more today.`
				: "That is over today's sending limit.";
		}
		default:
			return 'That did not go through. Try again in a minute.';
	}
}

/** The lock line, with the time sending opens again. */
export function lockWords(until: string | null | undefined): string {
	if (!until) return 'Sending is locked for now after too many wrong PINs.';
	const d = new Date(until);
	if (Number.isNaN(d.getTime())) return 'Sending is locked for now after too many wrong PINs.';
	const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
	return `Sending is locked until ${t} after too many wrong PINs.`;
}

/** The private-transfer fee, mirrored for the preview (the database charges it). */
export function privateFee(amount: number, percent: number, min: number): number {
	if (!(amount > 0)) return 0;
	return Math.max(Math.round(amount * percent) / 100, min);
}

/** A price typed by a person: up to two decimals, 0.1 to 1000. */
export function parsePrice(text: string): number | null {
	const t = text.trim();
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	const v = Number(t);
	return v >= 0.1 && v <= 1000 ? v : null;
}

/** Stars as text, for a screen reader beside the glyphs. */
export function starWords(stars: number | null, count: number): string {
	if (!count || stars === null) return 'No reviews yet';
	return `${stars.toFixed(1)} out of 5 from ${count} review${count === 1 ? '' : 's'}`;
}

/** A transfer refusal: a lock names when sending opens again. */
export function transferRefusalWords(r: Record<string, unknown> | null | undefined): string {
	if (r?.reason === 'locked') return lockWords(typeof r.locked_until === 'string' ? r.locked_until : null);
	return marketRefusalWords(r);
}

export interface TransferRow {
	id: string;
	at: string;
	amount: number;
	from: PersonRef;
	to: PersonRef;
	message: string | null;
	message_removed: boolean;
	private: boolean;
	fee: number;
	direction?: 'in' | 'out';
}

export function parseTransfer(v: unknown): TransferRow | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string') return null;
	const f = obj(o.from) ?? {};
	const t = obj(o.to) ?? {};
	return {
		id: o.id,
		at: s(o.at),
		amount: n(o.amount),
		from: { id: s(f.id), name: s(f.name, 'A student') },
		to: { id: s(t.id), name: s(t.name, 'A student') },
		message: sn(o.message),
		message_removed: o.message_removed === true,
		private: o.private === true,
		fee: n(o.fee),
		direction: o.direction === 'in' || o.direction === 'out' ? o.direction : undefined
	};
}

export interface TransferStatus {
	in_economy: boolean;
	has_pin: boolean;
	locked_until: string | null;
	balance: number;
	sent_today: number;
	rules: { daily_cap: number; private_fee_percent: number; private_fee_min: number; pin_tries: number; lock_minutes: number };
	mine: TransferRow[];
}

export function parseTransferStatus(v: unknown): TransferStatus | null {
	const o = obj(v);
	if (!o || o.signed_in !== true) return null;
	const r = obj(o.rules) ?? {};
	return {
		in_economy: o.in_economy === true,
		has_pin: o.has_pin === true,
		locked_until: sn(o.locked_until),
		balance: n(o.balance),
		sent_today: n(o.sent_today),
		rules: {
			daily_cap: n(r.daily_cap, 20),
			private_fee_percent: n(r.private_fee_percent, 10),
			private_fee_min: n(r.private_fee_min, 0.1),
			pin_tries: n(r.pin_tries, 5),
			lock_minutes: n(r.lock_minutes, 15)
		},
		mine: arr(o.mine).map(parseTransfer).filter((x): x is TransferRow => !!x)
	};
}

export interface DirectoryEntry {
	id: string;
	name: string;
	classes: ClassRef[];
}

export function parseDirectory(v: unknown): DirectoryEntry[] {
	return arr(v)
		.map(obj)
		.filter((x): x is Record<string, unknown> => !!x && typeof x.id === 'string')
		.map((x) => ({ id: String(x.id), name: s(x.name, 'A student'), classes: parseClasses(x.classes) }));
}

/** A coin amount typed by a person: two decimals at most, at least 0.1. */
export function parseCoinsTyped(text: string, min = 0.1): number | null {
	const t = text.trim();
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	const v = Number(t);
	return v >= min && v <= 100000 ? v : null;
}
