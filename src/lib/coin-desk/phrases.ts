/**
 * The coin phrase list (`coin_alias_list()`, ledger 0432), parsed. Plain data
 * and pure, so the settings panel and its test read the same shape.
 */
export interface CoinPhrase {
	id: string;
	phrase: string;
	kind: 'award' | 'fine' | 'purchase';
	category: string;
	categoryId: string;
	pricing_model: string;
	categoryAmount: number | null;
	amount: number | null;
	source: 'seed' | 'voice' | 'staff';
	uses: number;
	lastUsedAt: string | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function parseCoinPhrases(raw: unknown): CoinPhrase[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { phrase?: unknown }).phrase === 'string')
		.map((x) => ({
			id: x.id as string,
			phrase: x.phrase as string,
			kind: (['award', 'fine', 'purchase'].includes(String(x.kind)) ? x.kind : 'award') as CoinPhrase['kind'],
			category: String(x.category ?? x.category_id ?? ''),
			categoryId: String(x.category_id ?? ''),
			pricing_model: String(x.pricing_model ?? 'variable'),
			categoryAmount: num(x.category_amount),
			amount: num(x.amount),
			source: (['seed', 'voice', 'staff'].includes(String(x.source)) ? x.source : 'voice') as CoinPhrase['source'],
			uses: Math.max(0, Math.trunc(num(x.uses) ?? 0)),
			lastUsedAt: typeof x.last_used_at === 'string' ? x.last_used_at : null
		}));
}

export function phraseRefusalWords(reason: string): string {
	switch (reason) {
		case 'amount':
			return 'A default is more than 0 and at most 1000 coins.';
		case 'needs_whole_amount':
			return 'Give it a whole number of coins first; an official category has a whole price.';
		case 'name':
			return 'Give the category a name of up to 80 characters.';
		case 'name_taken':
			return 'A category with that name already exists. Pick another name.';
		case 'not_found':
			return 'That phrase is gone. Reload the page.';
		default:
			return `That did not go through (${reason}).`;
	}
}
