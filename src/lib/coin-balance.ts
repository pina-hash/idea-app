/**
 * IDEA Coin economy: student-facing balance page. PLAIN DATA + pure helpers
 * (client-safe, the coin-desk.ts convention). This is the READ-ONLY
 * counterpart to /coin-desk: a signed-in student's own balance, history,
 * wage tier, and Eating Pass status, queried directly against 0070's
 * coin_transactions / coin_wage_tiers tables under the OWN-ROW RLS policies
 * those tables already grant (`student_email = current_user_email() or
 * is_admin()`) -- never coin_admin_lookup or any other is_admin()-gated RPC.
 * There is no write path here at all; /coin-desk is the only place a coin
 * transaction is ever logged.
 *
 * Eating Pass status is NOT derived here. It used to be re-implemented in TS
 * over the transaction list (a second copy of coin_eating_pass_active /
 * coin_eating_pass_strikes' rule, liable to drift from the SQL silently);
 * 0072's `coin_my_eating_pass_status()` RPC now calls those two functions
 * directly and is the one place that rule lives. +page.server.ts calls it
 * and passes the result straight through -- this page trusts the database's
 * answer, it does not recompute it.
 */

import type { CoinBalances, CoinMedium } from '$lib/coin-desk';
import { coinNumber, coins } from '$lib/coin-format';

export interface CoinBalanceTransaction {
	id: string;
	category_id: string;
	amount: number;
	/**
	 * Which balance this row moved (0096). Optional so a row read from a
	 * pre-0096 backend, or a hand-written fixture that predates the column,
	 * still typechecks -- `undefined` is treated as 'digital' by
	 * `sumBalances` below, which is exactly what the backfill decided every
	 * pre-0096 row meant.
	 */
	medium?: CoinMedium;
	quantity: number | null;
	note: string | null;
	created_at: string;
	meta: Record<string, unknown> | null;
}

export interface DisplayTransaction extends CoinBalanceTransaction {
	category_name: string;
}

/**
 * Attaches each row's coin_categories display name. Falls back to the raw
 * category id for a category that no longer exists (retired or renamed)
 * rather than dropping a real history row over it.
 */
export function withCategoryNames(
	transactions: CoinBalanceTransaction[],
	categories: { id: string; name: string }[]
): DisplayTransaction[] {
	const names = new Map(categories.map((c) => [c.id, c.name]));
	return transactions.map((t) => ({ ...t, category_name: names.get(t.category_id) ?? t.category_id }));
}

/**
 * Shape of `coin_my_eating_pass_status()`'s jsonb result (0072). Not derived
 * here -- see the module doc comment above.
 */
export interface EatingPassStatus {
	active: boolean;
	strikes: number;
}

/**
 * The three numbers, summed the way `coin_balances` (the derived view) sums
 * them since 0096 -- total, physical, digital -- over rows the student's own
 * RLS policy already scoped to their own email.
 *
 * A row with no `medium` counts as DIGITAL, which is the backfill's own rule
 * for every pre-0096 row (the single balance was always the digital one), so
 * this and the view agree on a mixed-vintage list.
 */
export function sumBalances(transactions: CoinBalanceTransaction[]): CoinBalances {
	let physical = 0;
	let digital = 0;
	for (const t of transactions) {
		if (t.medium === 'physical') physical += t.amount;
		else digital += t.amount;
	}
	return { balance: physical + digital, physical_balance: physical, digital_balance: digital };
}

/**
 * The TOTAL alone, for callers that genuinely only want one number. Kept as a
 * thin wrapper over sumBalances rather than a second reduce, so there is one
 * implementation of the arithmetic here and it can never disagree with the
 * per-medium one beside it.
 */
export function sumBalance(transactions: CoinBalanceTransaction[]): number {
	return sumBalances(transactions).balance;
}

/* ======================================================================
 * IDEA COIN V2: THE STUDENT'S OWN COIN PAGE (migration 0241, coin_my_page)
 * ======================================================================
 *
 * Everything below is the client half of `/coin-balance` since V2. The page
 * reads ONE definer function, `coin_my_page()`, which takes no identity
 * parameter, and buys through four student actions that take no email and no
 * amount. Nothing here computes a balance: the payload carries the one number
 * (`_coin_balance`, digital rows only) and this module only reads it.
 *
 * WHAT IS NEVER SHOWN, because V2 retired it: a physical/digital split, a
 * separate debt figure, lifetime earned, spent or paid out. A negative balance
 * IS the debt and is rendered as the balance.
 */


export interface CoinPageHistoryRow {
	id: string;
	at: string;
	amount: number;
	category_id: string;
	name: string;
	kind: string | null;
	note: string | null;
	/** Set on an undo row: the id of the row it undoes. */
	reverses: string | null;
	/** True on a row a later undo cancelled. */
	reversed: boolean;
	/** Written by the system (weekly wage, highest grade, a hall pass fine). */
	automatic: boolean;
}

export interface CoinPageRule {
	/** 'Fine' | 'Award' | 'Purchase' (initcap of the category kind). */
	type: string;
	reason: string;
	/** The amount, in words: "5 i¢", "1-3 i¢", "1 i¢ per 10 grams". */
	detail: string;
	sort_order: number | null;
	category_id: string;
	explanation: string | null;
}

export interface CoinPageRoom {
	semester: string | null;
	total_points: number;
	cap_points: number;
	used_points: number;
	remaining_points: number;
}

export interface CoinPageSubmission {
	submission_id: string;
	item_id: string;
	title: string;
	score: number | null;
	extra_credit: number;
	out_of: number | null;
}

export interface CoinPageClass {
	section_id: string;
	label: string;
	room: CoinPageRoom;
	submissions: CoinPageSubmission[];
}

export interface CoinPayRaiseQuote {
	tier: number;
	new_tier: number;
	cost: number;
	wage_now: number;
	wage_after: number;
}

export interface CoinMyPage {
	in_economy: boolean;
	balance: number;
	wage_tier: number;
	weekly_wage: number;
	pay_raise: CoinPayRaiseQuote;
	eating_pass: { active: boolean; strikes: number; revoked_at: string | null; price: number | null };
	no_shop_today: boolean;
	print: { grams_per_coin: number; active: boolean };
	extra_credit: { price_per_point: number | null; classes: CoinPageClass[] };
	history: CoinPageHistoryRow[];
	rules: CoinPageRule[];
}

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(n) ? n : fallback;
}
function numOrNull(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = num(v, NaN);
	return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string {
	return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}
function strOrNull(v: unknown): string | null {
	const s = str(v).trim();
	return s ? s : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}

/**
 * `coin_my_page()`'s jsonb, validated. Answers NULL for a payload that is not
 * a signed-in page at all (`{signed_in:false}`, or something that is not an
 * object), so the caller renders the sign-in panel rather than a page of
 * zeros. Every numeric goes through `num`, because PostgREST and pg hand a
 * `numeric` back as a number or a string depending on the path.
 */
export function parseCoinMyPage(raw: unknown): CoinMyPage | null {
	const r = obj(raw);
	if (r.signed_in !== true) return null;
	const quote = obj(r.pay_raise);
	const pass = obj(r.eating_pass);
	const print = obj(r.print);
	const ec = obj(r.extra_credit);
	const tier = Math.max(1, Math.trunc(num(r.wage_tier ?? quote.tier, 1)));
	return {
		in_economy: r.in_economy === true,
		balance: num(r.balance),
		wage_tier: tier,
		weekly_wage: num(r.weekly_wage ?? quote.wage_now),
		pay_raise: {
			tier: Math.max(1, Math.trunc(num(quote.tier, tier))),
			new_tier: Math.trunc(num(quote.new_tier, tier + 1)),
			cost: num(quote.cost),
			wage_now: num(quote.wage_now),
			wage_after: num(quote.wage_after)
		},
		eating_pass: {
			active: pass.active === true,
			strikes: Math.max(0, Math.trunc(num(pass.strikes))),
			revoked_at: strOrNull(pass.revoked_at),
			price: numOrNull(pass.price)
		},
		no_shop_today: r.no_shop_today === true,
		print: { grams_per_coin: num(print.grams_per_coin, 10), active: print.active === true },
		extra_credit: {
			price_per_point: numOrNull(ec.price_per_point),
			classes: arr(ec.classes)
				.map((c) => {
					const o = obj(c);
					const room = obj(o.room);
					return {
						section_id: str(o.section_id),
						label: str(o.label) || 'Class',
						room: {
							semester: strOrNull(room.semester),
							total_points: num(room.total_points),
							cap_points: num(room.cap_points),
							used_points: num(room.used_points),
							remaining_points: Math.max(0, num(room.remaining_points))
						},
						submissions: arr(o.submissions)
							.map((s) => {
								const so = obj(s);
								return {
									submission_id: str(so.submission_id),
									item_id: str(so.item_id),
									title: str(so.title) || 'Untitled work',
									score: numOrNull(so.score),
									extra_credit: num(so.extra_credit),
									out_of: numOrNull(so.out_of)
								};
							})
							.filter((s) => s.submission_id)
					};
				})
				.filter((c) => c.section_id)
		},
		history: arr(r.history)
			.map((h) => {
				const o = obj(h);
				return {
					id: str(o.id),
					at: str(o.at),
					amount: num(o.amount),
					category_id: str(o.category_id),
					name: str(o.name) || str(o.category_id),
					kind: strOrNull(o.kind),
					note: strOrNull(o.note),
					reverses: strOrNull(o.reverses),
					reversed: o.reversed === true,
					automatic: o.automatic === true
				};
			})
			.filter((h) => h.id),
		rules: arr(r.rules)
			.map((x) => {
				const o = obj(x);
				return {
					type: str(o.type),
					reason: str(o.reason),
					detail: str(o.detail),
					sort_order: numOrNull(o.sort_order),
					category_id: str(o.category_id),
					explanation: strOrNull(o.explanation)
				};
			})
			.filter((x) => x.reason)
	};
}

/**
 * THE HISTORY A STUDENT READS: UNDONE PAIRS ARE HIDDEN, BOTH HALVES.
 *
 * An undo writes a `reversal` row carrying `reverses`, and the row it undid
 * reads `reversed`. Shown together they are two lines that cancel to nothing;
 * shown as one struck line they are still a line about something that did not
 * happen. So both go, and `hiddenPairs` says how many, in words beside the
 * list, so a student comparing an old screenshot is not left guessing.
 */
export function visibleHistory(rows: readonly CoinPageHistoryRow[]): {
	rows: CoinPageHistoryRow[];
	hiddenPairs: number;
} {
	const kept: CoinPageHistoryRow[] = [];
	let undoRows = 0;
	for (const row of rows) {
		if (row.reverses) {
			undoRows += 1;
			continue;
		}
		if (row.reversed) continue;
		kept.push(row);
	}
	return { rows: kept, hiddenPairs: undoRows };
}

/** The rule groups, in the order the page lists them, each with its heading. */
export const COIN_RULE_GROUPS = [
	{ type: 'Award', heading: 'Awards', lead: 'Ways to earn coins.' },
	{ type: 'Fine', heading: 'Fines', lead: 'What costs coins, and how much.' },
	{ type: 'Purchase', heading: 'Purchases', lead: 'What you can spend coins on.' }
] as const;

export function groupCoinRules(
	rules: readonly CoinPageRule[]
): { type: string; heading: string; lead: string; rules: CoinPageRule[] }[] {
	return COIN_RULE_GROUPS.map((g) => ({
		...g,
		rules: rules
			.filter((r) => r.type.toLowerCase() === g.type.toLowerCase())
			.sort(
				(a, b) =>
					(a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.reason.localeCompare(b.reason)
			)
	})).filter((g) => g.rules.length > 0);
}

/**
 * A 3D print's price: round half up of grams over grams per coin. The mirror
 * of `_coin_print_price` (0239), shown before the purchase; the database's
 * answer is the one charged. The small epsilon keeps a float like 2.4999999
 * from rounding a true half down. Time is never charged.
 */
export function coinPrintPrice(grams: number, gramsPerCoin: number): number {
	const per = Math.max(Number(gramsPerCoin) || 10, 0.01);
	const q = grams / per;
	return Math.floor(q + 0.5 + 1e-9);
}

/** Extra credit's cost: price per point times points, to the cent (0241). */
export function coinExtraCreditCost(points: number, pricePerPoint: number): number {
	return Math.round(pricePerPoint * points * 100) / 100;
}

/** The balance after a purchase, to the cent. */
export function coinBalanceAfter(balance: number, cost: number): number {
	return Math.round((balance - cost) * 100) / 100;
}

/** The one purchase rule (0239): refused unless the balance after is 0 or more. */
export function coinCanAfford(balance: number, cost: number): boolean {
	return coinBalanceAfter(balance, cost) >= 0;
}

/** What a student action answers. */
export type CoinBuyResult =
	| { ok: true; cost?: number; balance?: number; points?: number; new_tier?: number }
	| {
			ok: false;
			reason: string;
			balance?: number;
			cost?: number;
			room?: Partial<CoinPageRoom>;
			message?: string;
	  };

/**
 * A refusal in a student's words. Every reason the four purchases and their
 * seam can answer (0241) has a sentence, and an unknown one still gets a
 * sentence rather than a code.
 */
export function coinBuyRefusalWords(r: {
	reason: string;
	balance?: number | string | null;
	cost?: number | string | null;
	room?: Partial<CoinPageRoom> | null;
}): string {
	switch (r.reason) {
		case 'signed_out':
			return 'You are signed out. Sign in again, then try once more.';
		case 'not_in_economy':
			return 'None of your classes is using IDEA Coins right now, so nothing can be bought here.';
		case 'rate_limited':
			return 'That is a lot of purchases in one minute. Wait a minute, then try again.';
		case 'insufficient': {
			const cost = num(r.cost, NaN);
			const balance = num(r.balance, NaN);
			if (Number.isFinite(cost) && Number.isFinite(balance)) {
				return `This costs ${coins(cost)} and your balance is ${coins(balance)}. A purchase has to leave you at ${coins(0)} or more.`;
			}
			return `Your balance is too low. A purchase has to leave you at ${coins(0)} or more.`;
		}
		case 'pass_already_active':
			return 'You already hold an Eating Pass. You can buy a new one only after this one is revoked.';
		case 'cap': {
			const left = num(r.room?.remaining_points, NaN);
			if (Number.isFinite(left)) {
				return left > 0
					? `This class has only ${coinNumber(left)} extra credit point${left === 1 ? '' : 's'} left for you this semester.`
					: 'You have used all the extra credit this class allows this semester.';
			}
			return 'That is more extra credit than this class allows this semester.';
		}
		case 'not_your_work':
			return 'That work is not one of your returned assignments in this class. Pick another.';
		case 'not_your_class':
			return 'That class is not one of yours in the IDEA Coin economy. Pick another.';
		case 'grams':
			return 'Enter the weight the slicer shows, more than 0 and up to 5000 grams.';
		case 'points':
			return 'Enter a whole number of points, 1 or more.';
		case 'no_semester':
			return 'Extra credit opens once Mr. Pina sets up this semester. Ask him about it.';
		case 'not_available':
			return 'This is not for sale right now.';
		default:
			return 'That did not go through. Nothing was charged. Try again in a minute.';
	}
}

/**
 * Why there is no shop today. `coin_my_page` answers only whether the mark is
 * set; the usual cause is a Shop Safety fine logged today, which is in the
 * history, so its note is the why when it is there. Otherwise the mark was set
 * by hand, and the sentence says so rather than guessing.
 */
export function noShopWhy(history: readonly CoinPageHistoryRow[], today: string, dayOf: (iso: string) => string | null): string {
	const fine = history.find(
		(h) => h.category_id === 'shop_safety_violation' && !h.reversed && !h.reverses && dayOf(h.at) === today
	);
	if (fine) {
		return fine.note
			? `A shop safety fine today: ${fine.note}`
			: 'A shop safety fine was logged for you today.';
	}
	return 'Mr. Pina marked it for today.';
}

/**
 * When a row happened, on the school's clock and with no weekday ("Oct 14,
 * 3:05 PM"). The zone and locale are pinned so the server render and the
 * browser render print the same string.
 */
export function coinWhen(iso: string): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '';
	return new Date(t).toLocaleString('en-US', {
		timeZone: 'America/Los_Angeles',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** A score line for a piece of returned work: "18 / 20", or "not scored". */
export function coinScoreLine(s: Pick<CoinPageSubmission, 'score' | 'out_of'>): string {
	if (s.score === null) return 'not scored';
	return s.out_of === null ? `${coinNumber(s.score)} points` : `${coinNumber(s.score)} / ${coinNumber(s.out_of)}`;
}
