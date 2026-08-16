/**
 * IDEA Coin: how a coin figure and a coin transaction are DISPLAYED.
 *
 * Plain data + pure helpers, client-safe (the coin-desk.ts / coin-balance.ts
 * convention). Nothing here reads Supabase, and nothing here computes a
 * balance -- `sumBalances` in coin-balance.ts and `_coin_balance` in SQL are
 * the only places that arithmetic lives, and this module deliberately does not
 * duplicate a line of it.
 *
 * WHY IT EXISTS. Three surfaces (the student's own balance page, the Coin Desk
 * log, and the admin balance panel) each rendered their own copy of the same
 * transaction row, and the copies had drifted: all three styled a BALANCE
 * CORRECTION exactly like an ordinary award or fine, and none of them knew a
 * payout is two linked rows. The Ledger (static/coins/index.html) had been
 * taught both rules and they had not. The rules live here now, once, and those
 * surfaces render through CoinTransactionRows.svelte.
 *
 * THE STANDING CONSTRAINT, restated where it is enforced: physical and digital
 * are SEPARATE MEDIUMS and are never conflated. Nothing here adds them
 * together, and the one place they meet -- a payout -- is rendered as a move
 * BETWEEN them (`Digital -> Physical`), never as a single medium-less figure.
 * Conversion is one way; there is no deposit path back, and no display here
 * implies one.
 */

/**
 * THE ONE SPELLING OF THE CURRENCY SYMBOL.
 *
 * It had been written three ways across twenty-odd files -- the raw character,
 * the numeric entity `i&#162;` inside SVG `<text>`, and a `¢` escape --
 * with nothing tying them together, so a fourth was always one commit away.
 * Every coin surface renders this constant now; `tests/coin-symbol.test.ts`
 * greps the tree for the other spellings so a new one fails a test rather than
 * shipping.
 *
 * It is a SYMBOL, used like `$`: it follows the number with no space
 * (`155i¢`), and the word "coins" is never used where a value is rendered.
 *
 * DELIBERATELY NOT SHARED WITH: GREENLINE's `IC` (Ignition Credits, a separate
 * currency) or VANGUARD's own currency string. Both are excluded from the
 * sweep by name -- see the test.
 */
export const COIN_SYMBOL = 'i¢';

/** `155i¢`. The symbol trails the number, like a dollar sign leads one. */
export function coins(amount: number): string {
	return `${amount}${COIN_SYMBOL}`;
}

/**
 * `+40i¢` / `-15i¢` / `0i¢`.
 *
 * The sign comes from the STORED AMOUNT, never from what kind of thing the row
 * is. Reconstructing it from a type string is what made a +40 correction
 * render as a red -40 on the Ledger before 0103, and it is why nothing in this
 * module takes an absolute value except where a figure genuinely has no
 * direction (see `coinAmountDisplay` and transfers).
 */
export function signedCoins(amount: number): string {
	return `${amount > 0 ? '+' : ''}${amount}${COIN_SYMBOL}`;
}

/** The medium a row moved, as a reader sees it. */
export const COIN_MEDIUM_LABELS = { physical: 'Physical', digital: 'Digital' } as const;

export function coinMediumLabel(medium: string | null | undefined): string {
	const key = String(medium ?? '').toLowerCase();
	return key === 'physical' || key === 'digital' ? COIN_MEDIUM_LABELS[key] : '';
}

/**
 * The five type strings a coin row can display as -- the same five
 * `coin_public_transactions` derives server-side (0103), so the Ledger and
 * these surfaces can never disagree about what a row IS.
 */
export type CoinTxnType = 'award' | 'fine' | 'purchase' | 'adjustment' | 'payout';

export const COIN_TXN_TYPES: CoinTxnType[] = [
	'award',
	'fine',
	'purchase',
	'adjustment',
	'payout'
];

export const COIN_TXN_TYPE_LABELS: Record<CoinTxnType, string> = {
	award: 'Award',
	fine: 'Fine',
	purchase: 'Purchase',
	adjustment: 'Adjustment',
	payout: 'Payout'
};

/**
 * The two category ids that ARE a payout regardless of anything else.
 *
 * Mirrors 0103's own CASE. `payout_physical_credit` is deliberately NOT here
 * for the same reason it is not there: that row is only ever written as half
 * of a transfer, so it always carries a transfer id and is already caught by
 * the first branch. Adding it would be a second rule saying the same thing.
 */
export const COIN_PAYOUT_CATEGORY_IDS = ['coin_payout', 'legacy_payout'];

export interface CoinTypeInput {
	category_id?: string | null;
	transfer_id?: string | null;
}

/**
 * What KIND of transaction a row is, derived exactly the way
 * `coin_public_transactions` derives it (0103):
 *
 *   transfer_id present            -> payout
 *   a payout category              -> payout
 *   category kind fine/award/purchase -> that
 *   anything else                  -> adjustment
 *
 * `kind` is the row's `coin_categories.kind`, which the caller looks up from
 * the category list it already holds. WITHOUT IT everything that is not a
 * payout reads as an adjustment -- the same fallback the SQL has, and the safe
 * direction: an award mis-shown as a correction is confusing, a correction
 * mis-shown as an award is the defect this whole module exists to fix.
 */
export function coinTxnType(row: CoinTypeInput, kind?: string | null): CoinTxnType {
	if (row.transfer_id) return 'payout';
	if (row.category_id && COIN_PAYOUT_CATEGORY_IDS.includes(row.category_id)) return 'payout';
	const k = String(kind ?? '').toLowerCase();
	if (k === 'fine') return 'fine';
	if (k === 'award') return 'award';
	if (k === 'purchase') return 'purchase';
	return 'adjustment';
}

/** What an amount looks like: a tone for the colour, and the text itself. */
export interface CoinAmountDisplay {
	tone: 'positive' | 'negative' | 'purchase' | 'adjustment' | 'transfer';
	text: string;
}

/**
 * How one amount renders. THE SIGN IS THE LEDGER'S, ALWAYS.
 *
 * An ADJUSTMENT gets its own tone whatever its sign, which is the whole point:
 * a +40 refund is not an award and a -15 clawback is not a fine, and rendering
 * them in the award green and the fine amber is exactly what made a correction
 * unreadable as a correction.
 *
 * A TRANSFER is the one figure with no sign at all. A payout moves coins from
 * digital to physical: nothing was earned and nothing was spent, so a + or a -
 * would be a lie in either direction. It is the only place here that takes an
 * absolute value, and it does so because the direction is carried by the
 * `Digital -> Physical` note instead.
 */
export function coinAmountDisplay(amount: number, type: CoinTxnType): CoinAmountDisplay {
	const n = Number(amount) || 0;
	if (type === 'payout') {
		return { tone: 'transfer', text: `${Math.abs(n)}${COIN_SYMBOL}` };
	}
	if (type === 'adjustment') {
		return { tone: 'adjustment', text: signedCoins(n) };
	}
	if (n > 0) return { tone: 'positive', text: signedCoins(n) };
	if (type === 'purchase') return { tone: 'purchase', text: signedCoins(n) };
	return { tone: 'negative', text: signedCoins(n) };
}

/** A row as the shared renderer consumes it, after any pair has been merged. */
export interface CoinDisplayRow {
	id: string;
	category_id: string;
	category_name: string;
	amount: number;
	medium?: string | null;
	transfer_id?: string | null;
	note?: string | null;
	actor_email?: string | null;
	created_at: string;
	/** Set only on a collapsed transfer: the two ends of the move. */
	transferFrom?: string;
	transferTo?: string;
	/** True when this row is one withdrawal built from two stored rows. */
	isTransfer?: boolean;
}

interface CollapsibleRow {
	id: string;
	category_id: string;
	category_name: string;
	amount: number;
	medium?: string | null;
	transfer_id?: string | null;
	note?: string | null;
	actor_email?: string | null;
	created_at: string;
}

/**
 * Merges each payout's TWO stored rows into the one withdrawal they were.
 *
 * A payout is a digital debit and an equal physical credit sharing one
 * `transfer_id` (0096) -- that is what the ledger records, because the coins
 * changed form rather than going anywhere. To a reader it is one event, and
 * the Ledger has rendered it that way since 0103; these surfaces showed the
 * two halves as unrelated rows with opposite signs, which reads as money
 * leaving and separately arriving.
 *
 * THE KEY IS THE STORED `transfer_id` AND NOTHING ELSE. Pairing by matching
 * name, amount and timestamp would be guesswork over a key that already
 * exists -- and it would merge two withdrawals a student made in the same
 * minute, which is a real thing that happens. Rows with no transfer id pass
 * through untouched, which is also the whole behaviour on a backend that
 * predates 0096.
 *
 * ORDER IS PRESERVED: the merged row takes the position of the FIRST half
 * seen, so a caller that sorted before collapsing stays sorted after.
 */
export function collapseCoinTransfers(rows: readonly CollapsibleRow[]): CoinDisplayRow[] {
	const out: CoinDisplayRow[] = [];
	const byTransfer = new Map<string, CoinDisplayRow>();

	for (const row of rows ?? []) {
		const transferId = String(row.transfer_id ?? '').trim();
		if (!transferId) {
			out.push({ ...row });
			continue;
		}
		let pair = byTransfer.get(transferId);
		if (!pair) {
			pair = {
				...row,
				// The debit's own category name is "Coin Payout"; the credit's is
				// "Coin Payout (physical credit)", which names half of a thing.
				// The merged row is the withdrawal, so it says so.
				category_name: 'Coin Payout',
				amount: 0,
				medium: null,
				isTransfer: true,
				transferFrom: '',
				transferTo: ''
			};
			byTransfer.set(transferId, pair);
			out.push(pair);
		}
		// Each half names one end of the move: the debited medium is where the
		// coins came from, the credited one where they landed. If only one half
		// is present (a row limit can cut between them) the arrow keeps the end
		// it knows rather than inventing the other.
		const amount = Number(row.amount) || 0;
		const medium = String(row.medium ?? '').toLowerCase();
		if (amount < 0) pair.transferFrom = medium;
		else if (amount > 0) pair.transferTo = medium;
		pair.amount = Math.max(pair.amount, Math.abs(amount));
	}

	return out;
}

/**
 * The quiet line under an amount: which coins these are, or where they moved.
 * A transfer reads as an arrow between the two media -- never as one figure
 * with no medium, and never as the two added together.
 */
export function coinMediumNote(row: CoinDisplayRow): string {
	if (row.isTransfer) {
		const from = coinMediumLabel(row.transferFrom);
		const to = coinMediumLabel(row.transferTo);
		if (from && to) return `${from} → ${to}`;
		return from || to || '';
	}
	return coinMediumLabel(row.medium);
}
