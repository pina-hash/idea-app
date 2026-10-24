/**
 * VOICE TO ACTION FOR IDEA COINS (ledger 0432, feedback fba5bfcd): what Mr.
 * Pina said, turned into one coin record or one short question. Pure, so the
 * connector tool, its test and its evals run the same decisions.
 *
 * THE AMOUNT RULE, his correction of 2026-10-23: "Unless you can identify the
 * exact fine award or purchase item, I need to give you a number. Do not
 * assume a default value that is not previously listed. ... when I do
 * introduce a new award with a new value, that becomes a default value for
 * that award. To which I may adjust ... and then my adjustment is the new
 * default value." So:
 *   - a matched category with a listed (set) amount uses it;
 *   - a matched phrase with a saved default uses it, unless he says a number,
 *     which is used and becomes the new default;
 *   - a new phrase with a number logs it (as Custom Award, Fine or Purchase
 *     when no category fits) and saves the phrase with that number;
 *   - no number and nothing listed: one question asking for the number, and
 *     nothing is written.
 */

import { COIN_SYMBOL, coins } from '$lib/coin-format';

export type CoinKind = 'award' | 'fine' | 'purchase';

export interface VoiceCategory {
	id: string;
	name: string;
	kind: CoinKind;
	pricing_model: 'flat' | 'range' | 'variable';
	amount: number | null;
	min_amount: number | null;
	max_amount: number | null;
}

export interface VoiceAlias {
	id: string;
	phrase: string;
	kind: CoinKind;
	category_id: string;
	amount: number | null;
}

export interface VoiceCatalog {
	categories: VoiceCategory[];
	aliases: VoiceAlias[];
}

export const CUSTOM_CATEGORY: Record<CoinKind, string> = { award: 'custom_award', fine: 'custom_fine', purchase: 'custom_purchase' };

/** Lowercase letters and digits, single spaces: the alias table's own shape (0298's `_coin_phrase`). */
export function phraseOf(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.slice(0, 120)
		.trim();
}

const NUMBER_WORDS: Record<string, number> = {
	one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
	eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
	twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
};
const COIN_WORDS = new RegExp(`^(coins?|${COIN_SYMBOL}|ic|idea|points?|bucks?|each)$`);
const SYMBOL = new RegExp(COIN_SYMBOL, 'gi');

/** The number he said for the coins, if he said one: a figure or a number word, beside a coin word, or the only number said. */
export function numberIn(said: string): number | null {
	const tokens = said.toLowerCase().replace(SYMBOL, ` ${COIN_SYMBOL} `).split(/[^a-z0-9.\u00a2]+/).filter(Boolean);
	const values: { at: number; n: number }[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i].replace(/\.$/, '');
		let n: number | null = /^\d+(\.\d+)?$/.test(t) ? Number(t) : (NUMBER_WORDS[t] ?? null);
		if (n === null) continue;
		// "twenty five", "a hundred", "one hundred"
		const next = tokens[i + 1];
		if (n >= 20 && n < 100 && next && NUMBER_WORDS[next] && NUMBER_WORDS[next] < 10) {
			n += NUMBER_WORDS[next];
			i++;
		} else if (n < 10 && next === 'hundred') {
			n *= 100;
			i++;
		}
		values.push({ at: i, n });
	}
	if (/\ba hundred\b/i.test(said) && !values.some((v) => v.n === 100)) values.push({ at: -1, n: 100 });
	const beside = values.find((v) => COIN_WORDS.test(tokens[v.at + 1] ?? '') || COIN_WORDS.test(tokens[v.at + 2] ?? ''));
	if (beside) return beside.n;
	// A version like 0.3.3 or a block number is not an amount: only a lone number counts.
	const plain = values.filter((v) => !/^(block|period|section|question|version)$/.test(tokens[v.at - 1] ?? ''));
	return plain.length === 1 ? plain[0].n : null;
}

/** Award, fine or purchase, from his verb, or null when he did not say. */
export function kindIn(said: string): CoinKind | null {
	const s = said.toLowerCase();
	if (/\b(fine|fined|fining|dock|docked|deduct|deducted|penali[sz]e|charge him|charge her|take away|take off)\b/.test(s)) return 'fine';
	if (/\b(buy|buys|bought|buying|purchase|purchased|purchases|spend|spent|spending|pays? for|paid for|paying for)\b/.test(s)) return 'purchase';
	if (/\b(give|gave|giving|award|awarded|awarding|reward|rewarded|add|added|grant|pay|paid|earn|earned|bonus|tip|credit)\b/.test(s)) return 'award';
	return null;
}

const FILLER = new Set([
	'a', 'an', 'the', 'to', 'please', 'him', 'her', 'them', 'his', 'their', 'me', 'my', 'i', 'and', 'with', 'of', 'word',
	'coin', 'coins', 'idea', 'ic', 'points', 'point', 'each', 'some', 'just', 'now', 'today', 'hey', 'claude', 'ok', 'okay'
]);
const VERBS = /^(fine|fined|fining|dock|docked|deduct|deducted|give|gave|giving|award|awarded|awarding|reward|rewarded|add|added|grant|pay|paid|earn|earned|buy|buys|bought|buying|purchase|purchased|spend|spent|log|charge|take|for)$/;

/**
 * The words that say WHAT it was for: after "for" when he said it, otherwise
 * whatever is left once the name, the number, the verb and the filler are out.
 */
export function reasonIn(said: string, nameWords: string[]): string {
	const names = new Set(nameWords.map((w) => w.toLowerCase().replace(/[^a-z']/g, '')).filter((w) => w.length > 1 || (w.length === 1 && w !== 'a' && w !== 'i')));
	const lower = said.toLowerCase();
	const forAt = lower.search(/\bfor\b/);
	// What it was for ends with its sentence: "a trick shot. Hell yeah!" is the trick shot.
	const base = (forAt >= 0 ? said.slice(forAt + 3) : said).split(/[.!?](?:\s|$)/)[0];
	const words = base
		.replace(SYMBOL, ' ')
		.split(/\s+/)
		.map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
		.filter(Boolean);
	const kept = words.filter((w) => {
		const l = w.toLowerCase();
		if (names.has(l) || names.has(l.replace(/'s$/, ''))) return false;
		if (/^\d+(\.\d+)?$/.test(l) || NUMBER_WORDS[l] || l === 'hundred') return false;
		if (forAt < 0 && (VERBS.test(l) || FILLER.has(l))) return false;
		if (forAt >= 0 && (l === 'coin' || l === 'coins' || l === 'idea')) return false;
		return true;
	});
	// Trailing filler ("for being late today please") never belongs to the reason.
	while (kept.length && FILLER.has(kept[kept.length - 1].toLowerCase())) kept.pop();
	while (kept.length && FILLER.has(kept[0].toLowerCase())) kept.shift();
	return kept.join(' ');
}

const NAME_STOP = new Set(['in', 'class', 'on', 'of', 'the', 'a']);

export interface CoinMatch {
	category: VoiceCategory;
	alias: VoiceAlias | null;
	how: 'phrase' | 'category';
}

/** A phrase as matching compares it: the little words (a, an, the) are not part of what he meant. */
const key = (phrase: string) => phrase.split(' ').filter((w) => w && w !== 'a' && w !== 'an' && w !== 'the').join(' ');
const contains = (hay: string, needle: string) => key(needle).length > 0 && ` ${key(hay)} `.includes(` ${key(needle)} `);

/** The category his words name: an exact saved phrase first, then the longest saved phrase or category name inside them. */
export function matchCoin(reasonPhrase: string, saidPhrase: string, kind: CoinKind | null, catalog: VoiceCatalog): CoinMatch | null {
	const byId = new Map(catalog.categories.map((c) => [c.id, c]));
	const fits = (k: CoinKind) => !kind || k === kind;
	const exact = catalog.aliases.find((a) => key(a.phrase) === key(reasonPhrase) && fits(a.kind) && byId.has(a.category_id));
	if (exact) return { category: byId.get(exact.category_id)!, alias: exact, how: 'phrase' };
	const hay = reasonPhrase || saidPhrase;
	const phrases = catalog.aliases
		.filter((a) => fits(a.kind) && byId.has(a.category_id) && (contains(hay, a.phrase) || contains(saidPhrase, a.phrase)))
		.sort((a, b) => b.phrase.length - a.phrase.length);
	const names = catalog.categories
		.filter((c) => fits(c.kind) && !Object.values(CUSTOM_CATEGORY).includes(c.id))
		.map((c) => ({ c, words: phraseOf(c.name).split(' ').filter((w) => !NAME_STOP.has(w)) }))
		.filter(({ words }) => words.length > 0 && words.every((w) => contains(saidPhrase, w)))
		.sort((a, b) => b.words.join(' ').length - a.words.join(' ').length);
	const bestPhrase = phrases[0];
	const bestName = names[0];
	if (bestPhrase && (!bestName || bestPhrase.phrase.length >= bestName.words.join(' ').length)) {
		return { category: byId.get(bestPhrase.category_id)!, alias: null, how: 'phrase' };
	}
	if (bestName) return { category: bestName.c, alias: null, how: 'category' };
	return null;
}

export type CoinDecision =
	| { action: 'log'; kind: CoinKind; category: VoiceCategory; amount: number | null; note: string; phrase: string | null; amountFrom: 'listed' | 'said' | 'saved' }
	| { action: 'ask'; status: 'needs_kind' | 'needs_amount' | 'needs_choice'; question: string };

const KIND_WORD: Record<CoinKind, string> = { award: 'Award', fine: 'Fine', purchase: 'Purchase' };
const coinsWord = (n: number) => coins(n);

/** One decision from his words: what to log at what amount, or the one question to ask. */
export function decideCoin(input: { said: string; amount: number | null; nameWords: string[]; catalog: VoiceCatalog }): CoinDecision {
	const number = input.amount ?? numberIn(input.said.replace(new RegExp(`\\b(${input.nameWords.map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean).join('|') || 'zzzz'})\\b`, 'gi'), ' '));
	const reason = reasonIn(input.said, input.nameWords);
	const reasonPhrase = phraseOf(reason);
	const saidPhrase = phraseOf(input.said);
	let kind = kindIn(input.said);
	const match = matchCoin(reasonPhrase, saidPhrase, kind, input.catalog);
	kind = kind ?? match?.category.kind ?? null;
	if (!kind) {
		return { action: 'ask', status: 'needs_kind', question: 'Is this an award, a fine or a purchase?' };
	}
	const note = (reason || input.said).replace(/\s+/g, ' ').trim().slice(0, 300);
	const phrase = reasonPhrase || null;
	if (match) {
		const c = match.category;
		const saved = match.alias?.amount ?? null;
		if (c.pricing_model === 'flat') {
			if (number !== null && c.amount !== null && number !== c.amount) {
				return {
					action: 'ask',
					status: 'needs_choice',
					question: `${c.name} is set at ${coinsWord(c.amount)}. Log ${coinsWord(c.amount)}, or log ${coinsWord(number)} as a Custom ${KIND_WORD[kind]}?`
				};
			}
			return { action: 'log', kind: c.kind, category: c, amount: c.amount, note, phrase: match.alias ? match.alias.phrase : null, amountFrom: 'listed' };
		}
		const amount = number ?? saved;
		if (amount === null) {
			const range = c.pricing_model === 'range' && c.min_amount !== null && c.max_amount !== null ? ` ${c.name} takes ${c.min_amount} to ${c.max_amount}.` : '';
			return { action: 'ask', status: 'needs_amount', question: `How many coins for ${c.name}?${range}` };
		}
		if (c.pricing_model === 'range' && c.min_amount !== null && c.max_amount !== null && (amount < c.min_amount || amount > c.max_amount)) {
			return {
				action: 'ask',
				status: 'needs_choice',
				question: `${c.name} takes ${coinsWord(c.min_amount)} to ${coinsWord(c.max_amount)}, not ${coinsWord(amount)}. Log an amount in that range, or log ${coinsWord(amount)} as a Custom ${KIND_WORD[kind]}?`
			};
		}
		return { action: 'log', kind: c.kind, category: c, amount, note, phrase: match.alias ? match.alias.phrase : phrase, amountFrom: number !== null ? 'said' : 'saved' };
	}
	const custom = input.catalog.categories.find((c) => c.id === CUSTOM_CATEGORY[kind]);
	if (number === null) {
		return { action: 'ask', status: 'needs_amount', question: `How many coins for this ${kind}?` };
	}
	if (!custom) {
		return { action: 'ask', status: 'needs_choice', question: `No ${kind} category fits "${note}". Which category is it?` };
	}
	return { action: 'log', kind, category: custom, amount: number, note: note || input.said, phrase, amountFrom: 'said' };
}

/** `coin_voice_catalog()`'s answer, numbers made numbers; anything malformed is dropped. */
export function parseVoiceCatalog(raw: unknown): VoiceCatalog {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
	const kinds = new Set(['award', 'fine', 'purchase']);
	const categories = (Array.isArray(o.categories) ? o.categories : [])
		.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string' && kinds.has(String((c as { kind?: unknown }).kind)))
		.map((c) => ({
			id: String(c.id),
			name: String(c.name ?? c.id),
			kind: c.kind as CoinKind,
			pricing_model: (['flat', 'range', 'variable'].includes(String(c.pricing_model)) ? c.pricing_model : 'variable') as VoiceCategory['pricing_model'],
			amount: num(c.amount),
			min_amount: num(c.min_amount),
			max_amount: num(c.max_amount)
		}));
	const aliases = (Array.isArray(o.aliases) ? o.aliases : [])
		.filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as { phrase?: unknown }).phrase === 'string' && kinds.has(String((a as { kind?: unknown }).kind)))
		.map((a) => ({ id: String(a.id), phrase: String(a.phrase), kind: a.kind as CoinKind, category_id: String(a.category_id), amount: num(a.amount) }));
	return { categories, aliases };
}
