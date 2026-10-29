// src/lib/ideacad/solid/launch/share.ts
//
// SHARING A MODEL WITH PEOPLE, the plain-data layer (ledger 0470, report
// 155bba3d: "just pickl and share. simple. smooth experience. and ensure many
// users per file"). The shapes 0325's three functions answer, the parsers
// that read them, and every sentence the share panel says, so the panel, the
// in-memory api and the tests read one vocabulary.
//
// NAME AND EMAIL, EVERYWHERE (ledger 0471, Mr. Pina 2026-10-28, decision 72
// ideacad-sharing-shows-name-and-email): every person a sharing surface shows
// carries their school email beside their name, from 0329.
//
// NOTHING HERE IS A RULE. Who may be found, who may share and how many people
// a model may have are the database's (0325 over 0217 and 0205); this module
// decides only what a surface renders and says.
import type { PickerPerson } from '$lib/ui/person-picker';

export type ShareRole = 'viewer' | 'editor';
export type ShareRelation = 'teammate' | 'classmate' | 'school';

/** One row of `ideacad_share_people`: a person, by name and email. */
export interface SharePerson {
	key: string;
	name: string;
	/** Their school email; null only on a deployment before 0329. */
	email: string | null;
	avatar: string | null;
	avatarUrl: string | null;
	staff: boolean;
	relation: ShareRelation;
	/** What they already hold on this model, if anything. */
	access: ShareRole | null;
}

/** One row of `ideacad_direct_document_access`. */
export interface AccessPerson {
	key: string;
	name: string;
	/** The address the model is shared with; null only on a deployment before 0329. */
	email: string | null;
	avatar: string | null;
	avatarUrl: string | null;
	staff: boolean;
	role: ShareRole;
	grantedAt: string | null;
}

export interface AccessList {
	canChange: boolean;
	count: number;
	people: AccessPerson[];
}

/** One instruction to `ideacad_set_direct_document_access`. */
export type ShareChange = ({ key: string } | { email: string }) & { role: ShareRole | 'none' };

export type ShareResult =
	| { index: number; ok: true; key: string; name: string; role: ShareRole | null; before: ShareRole | null; changed: boolean }
	| { index: number; ok: false; reason: string };

export interface ShareOutcome {
	total: number;
	succeeded: number;
	refused: number;
	results: ShareResult[];
	/** The inverse changes, for exactly the rows that changed. */
	undo: ShareChange[];
	access: AccessList;
}

/** How long Undo stays on screen after a change. */
export const UNDO_MS = 8000;

/** The fewest letters the directory answers for, 0325's own floor. */
export const SHARE_MIN_LETTERS = 2;

export const SHARE_ROLE_WORDS: Record<ShareRole, string> = { viewer: 'Can view', editor: 'Can edit' };

/** Said in place of the panel on a deployment without 0325. */
export const SHARING_UNAVAILABLE = 'Sharing is being updated on the site. Try again in a few minutes.';

export const NOBODY_YET = 'Not shared with anyone yet. Only you can open it.';
export const PICKER_EMPTY = 'Nobody by that name. Type their full school email to share with them.';
export const PICK_HINT = 'Pick people, choose Can view or Can edit for each, then share.';

const RELATION_WORDS: Record<ShareRelation, string> = { teammate: 'Teammate', classmate: 'In your class', school: 'Bosco Tech' };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const role = (v: unknown): ShareRole | null => (v === 'viewer' || v === 'editor' ? v : null);

/** Whether the words in the box are enough to ask the directory about. */
export function shareSearchable(q: string): boolean {
	return q.replace(/\s+/g, '').length >= SHARE_MIN_LETTERS;
}

/** A whole address typed by hand, which is shared as typed. */
export function looksLikeAddress(q: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

export function parseSharePeople(raw: unknown): SharePerson[] {
	if (!Array.isArray(raw)) return [];
	const out: SharePerson[] = [];
	for (const r of raw) {
		if (!isRecord(r) || !str(r.key) || !str(r.name)) continue;
		const relation = r.relation === 'teammate' || r.relation === 'classmate' ? r.relation : 'school';
		out.push({ key: r.key as string, name: r.name as string, email: str(r.email), avatar: str(r.avatar), avatarUrl: str(r.avatarUrl), staff: r.staff === true, relation, access: role(r.access) });
	}
	return out;
}

function parsePerson(r: unknown): AccessPerson | null {
	if (!isRecord(r) || !str(r.key) || !str(r.name) || !role(r.role)) return null;
	return { key: r.key as string, name: r.name as string, email: str(r.email), avatar: str(r.avatar), avatarUrl: str(r.avatarUrl), staff: r.staff === true, role: role(r.role)!, grantedAt: str(r.grantedAt) };
}

export function parseAccess(raw: unknown): AccessList {
	if (!isRecord(raw)) return { canChange: false, count: 0, people: [] };
	const people = Array.isArray(raw.people) ? raw.people.map(parsePerson).filter((p): p is AccessPerson => p !== null) : [];
	return { canChange: raw.canChange === true, count: typeof raw.count === 'number' ? raw.count : people.length, people };
}

function parseChange(r: unknown): ShareChange | null {
	if (!isRecord(r)) return null;
	const to = r.role === 'none' ? 'none' : role(r.role);
	if (!to) return null;
	if (str(r.key)) return { key: r.key as string, role: to };
	if (str(r.email)) return { email: r.email as string, role: to };
	return null;
}

export function parseOutcome(raw: unknown): ShareOutcome {
	const o = isRecord(raw) ? raw : {};
	const results: ShareResult[] = [];
	for (const r of Array.isArray(o.results) ? o.results : []) {
		if (!isRecord(r) || typeof r.index !== 'number') continue;
		if (r.ok === true) results.push({ index: r.index, ok: true, key: str(r.key) ?? '', name: str(r.name) ?? 'Someone', role: role(r.role), before: role(r.before), changed: r.changed === true });
		else results.push({ index: r.index, ok: false, reason: str(r.reason) ?? 'That change did not go through.' });
	}
	const num = (v: unknown) => (typeof v === 'number' ? v : 0);
	return {
		total: num(o.total),
		succeeded: num(o.succeeded),
		refused: num(o.refused),
		results,
		undo: (Array.isArray(o.undo) ? o.undo : []).map(parseChange).filter((c): c is ShareChange => c !== null),
		access: parseAccess(o.access)
	};
}

/** A directory row as the shared picker draws it: picture, name, email, and how they relate to you. */
export function pickerRow(p: SharePerson): PickerPerson {
	const bits = [p.staff ? 'Staff' : RELATION_WORDS[p.relation]];
	if (p.staff && p.relation !== 'school') bits.push(RELATION_WORDS[p.relation]);
	if (p.access) bits.push(`Has it: ${SHARE_ROLE_WORDS[p.access]}`);
	return { key: p.key, name: p.name, email: p.email ?? undefined, detail: bits.join(' · '), picture: pictureOf(p), muted: false };
}

/** The `Avatar.svelte` subject for a sharing row, which carries only what 0325 sent. */
export function pictureOf(p: { name: string; avatar: string | null; avatarUrl: string | null }) {
	return { avatar: p.avatar, avatar_url: p.avatarUrl, display_name: p.name };
}

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);

/** The heading over the access list. */
export function sharedCountSentence(count: number): string {
	return count === 0 ? NOBODY_YET : `Shared with ${people(count)}`;
}

/** The confirmation after a change, said from what actually changed. */
export function outcomeSentence(outcome: ShareOutcome): string {
	const changed = outcome.results.filter((r): r is Extract<ShareResult, { ok: true }> => r.ok && r.changed);
	if (changed.length === 0) return outcome.refused > 0 ? 'Nothing changed.' : 'Nothing changed. They already had that access.';
	const added = changed.filter((r) => r.before === null && r.role !== null);
	const removed = changed.filter((r) => r.role === null);
	const moved = changed.filter((r) => r.before !== null && r.role !== null);
	const list = (rows: { name: string }[]) => (rows.length === 1 ? rows[0].name : rows.length === 2 ? `${rows[0].name} and ${rows[1].name}` : `${rows[0].name} and ${rows.length - 1} others`);
	const parts: string[] = [];
	if (added.length) parts.push(`Shared with ${list(added)}.`);
	if (moved.length === 1) parts.push(`${moved[0].name} ${moved[0].role === 'editor' ? 'can now edit' : 'can now view only'}.`);
	else if (moved.length) parts.push(`Changed access for ${people(moved.length)}.`);
	if (removed.length) parts.push(`Removed ${list(removed)}.`);
	return parts.join(' ');
}

export const UNDONE_SENTENCE = 'Undone. Sharing is back to how it was.';
