/**
 * The catalog's arithmetic (ledger 0391): how published certifications group
 * by category, and which ONE key a card carries for this person. Pure, so
 * `tests/cert-student-catalog.test.ts` can put a corpus to it with no browser.
 */
import type { CertSummary } from '$lib/certifications/types';

export interface CatalogGroup {
	category: string;
	items: CertSummary[];
}

/**
 * Grouped by category IN THE ORDER THE FUNCTION ANSWERED: `cert_catalog`
 * already orders by the category's earliest sort_order, then sort_order,
 * level, code, so a second sort here would be a second ranking.
 */
export function groupCatalog(items: readonly CertSummary[]): CatalogGroup[] {
	const groups: CatalogGroup[] = [];
	const byName = new Map<string, CatalogGroup>();
	for (const item of items) {
		const category = (item.category || '').trim() || 'Other';
		let g = byName.get(category);
		if (!g) {
			g = { category, items: [] };
			byName.set(category, g);
			groups.push(g);
		}
		g.items.push(item);
	}
	return groups;
}

/** The one key a card carries. Every arm says a word; `start` says why it is dark. */
export type CatalogKey =
	| { kind: 'start'; label: 'Start' | 'Start again'; enabled: boolean; missing: string[] }
	| { kind: 'continue'; label: 'Continue'; dormant: boolean }
	| { kind: 'earned'; label: 'Earned'; serialTail: string | null }
	| { kind: 'withdrawn'; label: 'Withdrawn: start again'; enabled: boolean; missing: string[] };

export function missingPrerequisites(c: Pick<CertSummary, 'prerequisites'>): string[] {
	return (c.prerequisites ?? []).filter((p) => !p.held).map((p) => p.code);
}

/** "Needs SAFE-1 first", "Needs SAFE-1 and MILL-1 first", "Needs SAFE-1, MILL-1 and LATHE-1 first". */
export function needsWords(missing: readonly string[]): string {
	if (!missing.length) return '';
	if (missing.length === 1) return `Needs ${missing[0]} first`;
	const head = missing.slice(0, -1).join(', ');
	return `Needs ${head} and ${missing[missing.length - 1]} first`;
}

/** The last group of a serial, `W4PB` of `IDEA-7K3Q-M9XD-2HTR-W4PB`, or null. */
export function serialTail(serial: string | null | undefined): string | null {
	if (!serial) return null;
	const parts = serial.split('-');
	const tail = parts[parts.length - 1];
	return tail && tail.length === 4 ? tail : null;
}

/**
 * `serials` is this person's own awards by code (from `cert_me`), because
 * `cert_catalog` answers `held` and never a serial; absent, Earned shows no
 * tail and nothing is invented.
 */
export function catalogKey(c: CertSummary, serials: Readonly<Record<string, string>> = {}): CatalogKey {
	const my = c.my;
	const missing = missingPrerequisites(c);
	if (my.held && !my.expired) {
		return { kind: 'earned', label: 'Earned', serialTail: serialTail(serials[c.code]) };
	}
	if (my.state === 'active' || my.state === 'dormant') {
		return { kind: 'continue', label: 'Continue', dormant: my.state === 'dormant' };
	}
	if (my.state === 'withdrawn') {
		return { kind: 'withdrawn', label: 'Withdrawn: start again', enabled: missing.length === 0, missing };
	}
	// `none`, or `complete` whose award has expired: a fresh start.
	return {
		kind: 'start',
		label: my.state === 'complete' || my.expired ? 'Start again' : 'Start',
		enabled: missing.length === 0,
		missing
	};
}

/** "3 holders", "1 holder", "No holders yet". */
export function holdersWords(count: number): string {
	if (count <= 0) return 'No holders yet';
	return `${count} holder${count === 1 ? '' : 's'}`;
}

/** "About 12 days to earn", from the function's average; null renders nothing. */
export function completionWords(days: number | null | undefined): string | null {
	if (days === null || days === undefined || !Number.isFinite(days)) return null;
	const d = Math.max(1, Math.round(days));
	return `About ${d} day${d === 1 ? '' : 's'} to earn`;
}

/** The first two lines of a definition, by sentence, and whether there is more. */
export function definitionLead(text: string, sentences = 2): { lead: string; rest: string } {
	const trimmed = (text ?? '').trim();
	if (!trimmed) return { lead: '', rest: '' };
	const parts = trimmed.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [trimmed];
	if (parts.length <= sentences) return { lead: trimmed, rest: '' };
	return { lead: parts.slice(0, sentences).join('').trim(), rest: parts.slice(sentences).join('').trim() };
}
