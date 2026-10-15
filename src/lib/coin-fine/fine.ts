/**
 * THE FINE SCREEN, the pure half (IDEA Coin V2, ledger 0384).
 *
 * Types, the order of the tiles, the names on them, which buttons exist and
 * what a refusal says. No Svelte, no Supabase and no clock: everything that
 * needs one takes it as a parameter, so every rule here is assertable without
 * a browser. `FineScreen.svelte` is the surface and `./transports.ts` the
 * calls; neither restates anything in this file.
 *
 * WHAT THE DATABASE DECIDES. Every write is `coin_fine_log` (0240), which is
 * admin only and re-checks the caller; the amount of a flat fine is the
 * category row's, read by the database at post time, so the figure on a button
 * is a label and never a price this client sends. Property Damage is the one
 * special token: an accident is free the first time this semester and a repeat
 * after that, and the server picks which.
 */
import { splitLastFirst } from '$lib/classroom/assignment-spec';

/** One class the fine screen can open (`coin_fine_sections`). */
export interface FineSection {
	id: string;
	label: string;
	teacher_email: string | null;
	in_session: boolean;
	students: number;
}

/** One student on a tile (`coin_fine_roster`). */
export interface FineStudent {
	email: string;
	display_name: string | null;
	balance: number | string;
	out_on_pass: boolean;
	no_shop: boolean;
	eating_pass?: boolean;
}

export interface FineRoster {
	section_id: string;
	label: string;
	students: FineStudent[];
}

/** A category row as `coin_settings_get` projects it. */
export interface FineCategory {
	id: string;
	name: string;
	kind: string;
	pricing_model: string;
	amount: number | string | null;
	min_amount: number | string | null;
	max_amount: number | string | null;
	loggable: boolean;
	active: boolean;
	sort_order?: number | null;
}

export interface FineSettings {
	/** The ordered button list (`settings.fine_buttons`); 'property_damage' is the one special token. */
	fineButtons: string[];
	categories: FineCategory[];
}

/** One student's answer inside a `coin_fine_log` result. */
export interface FineLogRow {
	email: string;
	ok: boolean;
	transaction_id?: string | null;
	amount?: number | string | null;
	reason?: string | null;
	message?: string | null;
	cap_period?: string | null;
}

export interface FineLogOutcome {
	total: number;
	succeeded: number;
	refused: number;
	results: FineLogRow[];
}

/**
 * A transport's answer. `missing` is the honest state of a database the
 * migration has not reached (PGRST202 / 42883): the surface says so in words
 * rather than reading it as a failure to retry.
 */
export type FineResult<T> =
	| { ok: true; data: T }
	| { ok: false; missing: boolean; message: string };

/**
 * THE CALLS, INJECTED. The page points them at the RPCs; the harness answers
 * in memory. An omitted `reverse` removes the Undo control.
 */
export interface FineTransports {
	sections(): Promise<FineResult<FineSection[]>>;
	roster(sectionId: string): Promise<FineResult<FineRoster>>;
	settings(): Promise<FineResult<FineSettings>>;
	log(
		emails: string[],
		categoryId: string,
		options?: { amount?: number | null; carelessCost?: number | null }
	): Promise<FineResult<FineLogOutcome>>;
	reverse?(transactionId: string): Promise<FineResult<{ ok: boolean; reason?: string | null }>>;
}

/** How long an Undo stays on screen after a post. */
export const FINE_UNDO_MS = 10_000;
/** How long a press must be held on a tile to start picking several. */
export const FINE_HOLD_MS = 500;
/** How often an open fine screen re-reads its roster (balances, hall pass, no shop). */
export const FINE_ROSTER_POLL_MS = 120_000;
/** The one special token in `fine_buttons`. */
export const PROPERTY_DAMAGE = 'property_damage';
/** The most students one post may name (`coin_fine_log` refuses past it). */
export const FINE_MAX_STUDENTS = 60;

/** A number from a numeric column, which PostgREST or pg may hand back as a string. */
export function num(v: number | string | null | undefined): number | null {
	if (v == null || v === '') return null;
	const n = typeof v === 'string' ? Number(v) : v;
	return Number.isFinite(n) ? n : null;
}

/** The first name a tile shows, from a display name that is often "Last, First". */
export function firstNameOf(student: Pick<FineStudent, 'display_name' | 'email'>): {
	first: string;
	last: string;
} {
	const { first, last } = splitLastFirst(student.display_name ?? '', student.email);
	// A one-word name comes back as last only: that word IS what a person is called.
	return first ? { first, last } : { first: last, last: '' };
}

/**
 * THE TILES, IN A FIXED ALPHABETICAL ORDER BY FIRST NAME, THEN LAST, THEN
 * ADDRESS, so a tile never moves between two reads of the roster: a teacher's
 * thumb learns where a name is, and a list that reshuffled on a balance change
 * would put the next tap on the wrong student.
 */
export function tileOrder(students: readonly FineStudent[]): FineStudent[] {
	const key = (s: FineStudent) => {
		const n = firstNameOf(s);
		return [n.first.toLocaleLowerCase('en-US'), n.last.toLocaleLowerCase('en-US'), s.email];
	};
	return [...students].sort((a, b) => {
		const ka = key(a);
		const kb = key(b);
		for (let i = 0; i < ka.length; i++) {
			if (ka[i] < kb[i]) return -1;
			if (ka[i] > kb[i]) return 1;
		}
		return 0;
	});
}

/**
 * THE WORD ON EACH TILE: the first name, and where two students share one, the
 * first name and the last initial ("Ana R."), and where that still collides the
 * whole name. Keyed by address.
 */
export function tileNames(students: readonly FineStudent[]): Map<string, string> {
	const names = students.map((s) => ({ email: s.email, ...firstNameOf(s) }));
	const count = (list: string[]) => {
		const m = new Map<string, number>();
		for (const k of list) m.set(k, (m.get(k) ?? 0) + 1);
		return m;
	};
	const firsts = count(names.map((n) => n.first.toLocaleLowerCase('en-US')));
	const short = (n: { first: string; last: string }) =>
		n.last ? `${n.first} ${n.last.slice(0, 1).toLocaleUpperCase('en-US')}.` : n.first;
	const shorts = count(names.map((n) => short(n).toLocaleLowerCase('en-US')));
	const out = new Map<string, string>();
	for (const n of names) {
		if ((firsts.get(n.first.toLocaleLowerCase('en-US')) ?? 0) < 2) out.set(n.email, n.first);
		else if ((shorts.get(short(n).toLocaleLowerCase('en-US')) ?? 0) < 2) out.set(n.email, short(n));
		else out.set(n.email, n.last ? `${n.first} ${n.last}` : n.first);
	}
	return out;
}

/** What a fine or award button does when pressed. */
export type FineAsk = 'none' | 'amount' | 'property_damage';

export interface FineButton {
	id: string;
	name: string;
	/** The flat amount shown on the button, or null where the press asks first. */
	amount: number | null;
	min: number | null;
	max: number | null;
	ask: FineAsk;
}

const ASK_BY_MODEL: Record<string, FineAsk | undefined> = {
	flat: 'none',
	range: 'amount',
	variable: 'amount'
};

function buttonOf(c: FineCategory): FineButton | null {
	const ask = ASK_BY_MODEL[c.pricing_model];
	if (!ask) return null;
	return {
		id: c.id,
		name: c.name,
		amount: ask === 'none' ? num(c.amount) : null,
		min: num(c.min_amount),
		max: num(c.max_amount),
		ask
	};
}

/**
 * THE FINE BUTTONS, in the settings' own order. An id the catalogue does not
 * have, or one retired or not loggable, is left out rather than drawn as a
 * button whose only answer is a refusal. Property Damage is drawn from its own
 * token, named after the first-accident row when the catalogue has one.
 */
export function fineButtons(settings: FineSettings): FineButton[] {
	const byId = new Map(settings.categories.map((c) => [c.id, c]));
	const out: FineButton[] = [];
	const seen = new Set<string>();
	for (const id of settings.fineButtons) {
		if (seen.has(id)) continue;
		seen.add(id);
		if (id === PROPERTY_DAMAGE) {
			out.push({ id, name: 'Property Damage', amount: null, min: null, max: null, ask: 'property_damage' });
			continue;
		}
		const c = byId.get(id);
		if (!c || !c.active || !c.loggable || c.kind !== 'fine') continue;
		const b = buttonOf(c);
		if (b) out.push(b);
	}
	return out;
}

/** Awards a press can post: active, loggable, and priced flat, in a range, or by the person logging. */
export function awardButtons(categories: readonly FineCategory[]): FineButton[] {
	return categories
		.filter((c) => c.kind === 'award' && c.active && c.loggable && c.id !== 'extra_credit')
		.slice()
		.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
		.map(buttonOf)
		.filter((b): b is FineButton => b !== null);
}

/**
 * AN AMOUNT TYPED FOR A RANGE OR A VARIABLE CATEGORY, checked against the
 * category's own bounds before anything is sent. The database checks again;
 * this is so the sentence arrives before the press rather than after it.
 */
export function parseFineAmount(
	text: string | number,
	button: Pick<FineButton, 'min' | 'max'>
): { ok: true; amount: number } | { ok: false; message: string } {
	const t = String(text).trim();
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, message: 'Type an amount, like 5 or 2.50.' };
	const n = Number(t);
	if (n <= 0) return { ok: false, message: 'The amount has to be more than 0.' };
	if (button.min != null && n < button.min)
		return { ok: false, message: `The amount has to be at least ${button.min}.` };
	if (button.max != null && n > button.max)
		return { ok: false, message: `The amount can be at most ${button.max}.` };
	return { ok: true, amount: n };
}

/** A repair cost in dollars, for careless property damage. */
export function parseRepairCost(
	text: string | number
): { ok: true; dollars: number } | { ok: false; message: string } {
	const t = String(text).trim().replace(/^\$/, '');
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, message: 'Type the repair cost in dollars, like 12 or 7.50.' };
	const n = Number(t);
	if (n <= 0) return { ok: false, message: 'The repair cost has to be more than $0.' };
	return { ok: true, dollars: n };
}

/** A refused row, in words. Names no table, no function and no code. */
export function fineRefusalWords(row: Pick<FineLogRow, 'reason' | 'message' | 'cap_period'>): string {
	switch (row.reason) {
		case 'cap_reached':
			return row.cap_period === 'month'
				? 'Already logged the most allowed this month.'
				: 'Already logged the most allowed today.';
		case 'insufficient':
			return 'Not enough coins.';
		case 'pass_already_active':
			return 'Already has one.';
		case 'not_reversible':
			return 'That one cannot be undone here.';
		case 'already_reversed':
			return 'Already undone.';
		case 'not_found':
			return 'That entry could not be found.';
		case 'no_students':
			return 'Pick a student first.';
		case 'too_many':
			return `Pick ${FINE_MAX_STUDENTS} students or fewer at a time.`;
		case 'error':
			return row.message ? `Not posted: ${row.message}` : 'Not posted.';
		default:
			return row.message ?? 'Not posted.';
	}
}

/** Is this an id the screen may remember as the last class used. */
export function isSectionId(v: unknown): v is string {
	return typeof v === 'string' && /^[0-9a-f-]{8,64}$/i.test(v);
}

export interface CoinFinePrefs {
	lastSection: string | null;
}

/**
 * THE `coinFine` PREFERENCE NAMESPACE: the last class opened, and nothing
 * else. A value this build cannot use is DROPPED on read rather than coerced.
 * It stores a DEFAULT (where to land), never an entry: no student and no fine
 * is ever remembered across a session.
 */
export function readCoinFinePrefs(blob: unknown): CoinFinePrefs {
	const ns =
		blob && typeof blob === 'object' && !Array.isArray(blob)
			? (blob as Record<string, unknown>).coinFine
			: undefined;
	if (!ns || typeof ns !== 'object' || Array.isArray(ns)) return { lastSection: null };
	const last = (ns as Record<string, unknown>).lastSection;
	return { lastSection: isSectionId(last) ? last : null };
}

/**
 * WHERE THE SCREEN LANDS: the class in session now (the last one used, if two
 * are), otherwise the last one used, otherwise the first in the list.
 */
export function landingSection(sections: readonly FineSection[], lastUsed: string | null): string | null {
	if (sections.length === 0) return null;
	const inSession = sections.filter((s) => s.in_session);
	if (inSession.length > 0) {
		return (inSession.find((s) => s.id === lastUsed) ?? inSession[0]).id;
	}
	if (lastUsed && sections.some((s) => s.id === lastUsed)) return lastUsed;
	return sections[0].id;
}

/** "Ana", "Ana and Ben", "Ana, Ben and 3 more". */
export function namesSentence(names: readonly string[]): string {
	if (names.length === 0) return 'nobody';
	if (names.length === 1) return names[0];
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	if (names.length <= 4) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
	return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/** The transaction ids a post produced, in the order the database answered. */
export function postedIds(outcome: FineLogOutcome): string[] {
	return outcome.results
		.filter((r) => r.ok && typeof r.transaction_id === 'string' && r.transaction_id)
		.map((r) => r.transaction_id as string);
}
