/**
 * PICK A PERSON FROM A LIST (ledger 0455, report c6830880: "I want to be able
 * to select from a list of users instead of having to type in the email
 * manually every single time"). The host console's directory reads
 * `tournament_people_search` (0317): a host or an admin, two letters of a
 * shown name or a school address, school accounts only, at most 12.
 *
 * Plain data and pure functions, the `tournaments.ts` convention, so the
 * picker, its dev harness and the test read the same answer the same way.
 * A typed address is still accepted: the picker hands back whatever the box
 * holds, and the RPCs behind the rows (`tournament_send_invite`,
 * `tournament_add_host`, `tournament_add_entry_member`) resolve an address as
 * they always did.
 */

export interface PersonResult {
	email: string;
	/** The shown name: a chosen display name when there is one. */
	name: string;
	role: 'student' | 'teacher' | 'visitor' | string;
	/** Already on an entry of this tournament. */
	inTournament: boolean;
}

export type PeopleAnswer =
	| { ok: true; rows: PersonResult[] }
	/** `unavailable`: a deployment without the directory (PGRST202); `refused`: not a host. */
	| { ok: false; reason: 'unavailable' | 'refused' | 'failed' };

/** The fewest letters the directory answers for, its own floor (0317). */
export const PEOPLE_MIN_LETTERS = 2;

/** The wait after the last keystroke before asking. */
export const PEOPLE_DEBOUNCE_MS = 180;

/** Whether the words in the box are enough to ask about. */
export function searchable(q: string): boolean {
	return q.replace(/\s+/g, '').length >= PEOPLE_MIN_LETTERS;
}

/** A plausible school address typed by hand: it goes through as typed. */
export function looksLikeEmail(q: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `tournament_people_search`'s answer, with anything malformed dropped. */
export function parsePeople(raw: unknown): PersonResult[] {
	if (!Array.isArray(raw)) return [];
	const out: PersonResult[] = [];
	for (const r of raw) {
		if (!isRecord(r) || typeof r.email !== 'string' || !r.email.includes('@')) continue;
		out.push({
			email: r.email.toLowerCase(),
			name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : r.email.split('@')[0],
			role: typeof r.role === 'string' ? r.role : 'visitor',
			inTournament: r.in_tournament === true
		});
	}
	return out;
}

/** A refusal in the host's words, by the database's code alone. */
export function peopleAnswerFrom(data: unknown, error: { code?: string; message?: string } | null): PeopleAnswer {
	if (!error) return { ok: true, rows: parsePeople(data) };
	if (error.code === 'PGRST202') return { ok: false, reason: 'unavailable' };
	if (/host or a site admin/.test(error.message ?? '')) return { ok: false, reason: 'refused' };
	return { ok: false, reason: 'failed' };
}

/** The line under a result: who they are, and whether they are already in. */
export function personDetail(p: PersonResult): string {
	const role = p.role === 'teacher' ? 'Staff' : p.role === 'student' ? 'Student' : 'Account';
	return `${role} · ${p.email}${p.inTournament ? ' · already entered' : ''}`;
}
