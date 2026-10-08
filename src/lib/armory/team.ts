/**
 * THE TEAM VIEW'S DECISIONS (report of 2026-10-07 "members should be linked to
 * site users", and Armory v0.3 item 5, "who is online"). Pure, so the words
 * about a student are pinned by a test rather than by reading a template.
 *
 * AN INSTRUMENT'S SILENCE IS NEVER A FACT ABOUT A STUDENT (CLAUDE.md, "WHO IS
 * WORKING"). The Windows app sends a heartbeat about once a minute while it is
 * open; a computer whose last beat is older than `ARMORY_ONLINE_MS` is said to
 * have been "Last heard from" at that time, and a computer that has never sent
 * one (an app older than 0.3) has "No status". THE WORD "OFFLINE" IS NEVER
 * PRINTED: a missing beat is a closed app, a sleeping laptop, a school network
 * that dropped a request or an old app, and the page cannot tell which.
 * `tests/armory-team-presence.test.ts` sweeps every state and age for it.
 */
import {
	holderName,
	memberErrorWords,
	personName,
	ROLE_WORDS,
	whenWords,
	type ArmoryCheckout,
	type ArmoryMember,
	type ArmoryRole,
	type ArmoryTeamDevice
} from './view';

/** Two missed one-minute beats. Inside it the app is open; outside it, the page says when. */
export const ARMORY_ONLINE_MS = 120_000;

/**
 * How often the Team view re-ages what it shows. The heartbeat writes no
 * change-feed row, so realtime never fires for presence; without a clock tick
 * "Armory open" would sit on screen long after somebody closed the app.
 */
export const ARMORY_PRESENCE_TICK_MS = 30_000;

/** How often the open Team view re-reads `armory_team_status` (visible tab only, through startPoller). */
export const ARMORY_TEAM_POLL_MS = 60_000;

export type PresenceTone = 'open' | 'heard' | 'unknown';

export interface Presence {
	tone: PresenceTone;
	glyph: string;
	words: string;
}

/**
 * The app's own word for what it is doing, as a phrase after "Armory open".
 * 0233 checks the state only as ONE WORD (letters, digits, dashes,
 * underscores), so an app release may send a word this build has never seen;
 * a known word reads in plain English and an unknown one is shown as sent,
 * its dashes and underscores as spaces. One exception, and it is the rule
 * this module exists for: a word that says "offline" is never printed. A
 * heartbeat that arrived is a running app, so the word says nothing the line
 * does not already, and a page that prints it about a student is an
 * instrument stated as a fact.
 */
export function deviceStateWords(state: string | null | undefined): string | null {
	const word = state?.trim();
	if (!word || word === 'idle') return null;
	if (word === 'syncing') return 'syncing';
	if (word === 'offline-soon') return 'closing';
	if (/offline/i.test(word)) return null;
	return word.replace(/[-_]+/g, ' ').toLowerCase();
}

/** One computer's line, in words a glyph sits beside. Never "offline". */
export function devicePresence(device: Pick<ArmoryTeamDevice, 'last_seen' | 'state'>, now: number): Presence {
	const at = device.last_seen ? Date.parse(device.last_seen) : Number.NaN;
	if (Number.isNaN(at)) {
		return { tone: 'unknown', glyph: '?', words: 'No status from this computer yet (its app may be older than 0.3)' };
	}
	if (now - at <= ARMORY_ONLINE_MS) {
		const doing = deviceStateWords(device.state);
		return { tone: 'open', glyph: '●', words: doing ? `Armory open, ${doing}` : 'Armory open' };
	}
	return { tone: 'heard', glyph: '◷', words: `Last heard from ${whenWords(new Date(at).toISOString(), now)}` };
}

/**
 * What a member with no computer listed reads. A device row is a
 * registration, so "No computer connected yet" is a fact, but only when the
 * server says how many registrations there are. 0233's team read lists a
 * computer only when it was heard from or registered in the last 30 days, or
 * holds one of this project's checkouts (`devices_total` counts them all), so
 * a member with registrations and none listed has not been heard from in 30
 * days. Without the count the sentence claims only what the list shows.
 */
export function noComputerWords(member: Pick<ArmoryMember, 'devices_total'>): string {
	if (member.devices_total === 0) return 'No computer connected yet';
	if (typeof member.devices_total === 'number') return 'No computer heard from in the last 30 days';
	return 'No recent status from any of their computers';
}

/** The app version beside a computer, when it sent one. */
export function appVersionWords(device: Pick<ArmoryTeamDevice, 'app_version'>): string | null {
	const v = device.app_version?.trim();
	return v ? `Armory ${v.replace(/^v/i, '')}` : null;
}

const ROLE_ORDER: Record<ArmoryRole, number> = { mentor: 0, cad_lead: 1, instructor: 2, student: 3 };

/** The name a member is shown by: their chosen name when the server sent one, else their address's first part. */
export function memberName(member: Pick<ArmoryMember, 'email' | 'name'>): string {
	const chosen = member.name?.trim();
	return chosen ? chosen : personName(member.email);
}

/** Mentors, then CAD leads, instructors and students, each by name. */
export function sortTeam<T extends Pick<ArmoryMember, 'email' | 'role' | 'name'>>(members: readonly T[]): T[] {
	return [...members].sort(
		(a, b) =>
			(ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
			memberName(a).localeCompare(memberName(b), 'en', { sensitivity: 'base' }) ||
			a.email.localeCompare(b.email)
	);
}

/**
 * ONE NAME MAP FOR THE WHOLE PAGE: email to chosen name. The team's own names
 * first (0233 reads them through the site account), then the checkout list's
 * holder names (0232), so the file rows, the checkout table, the activity and
 * the members list all say the same name for the same person. `holderName`
 * reads it and falls back to the address's first part.
 */
export function teamNames(team: readonly ArmoryMember[], checkouts: readonly ArmoryCheckout[]): Map<string, string | null> {
	const names = new Map<string, string | null>();
	for (const c of checkouts) if (c.holder_name?.trim()) names.set(c.holder_email, c.holder_name.trim());
	for (const m of team) if (m.name?.trim()) names.set(m.email, m.name.trim());
	return names;
}

/** "Ana Reyes" or "You", for the viewer's own rows. */
export function holderWords(email: string, me: string, names: ReadonlyMap<string, string | null>): string {
	return email === me ? 'You' : holderName(email, names);
}

/** How many files a member has checked out: the team payload's own list, else the checkout list. */
export function checkoutCountFor(member: Pick<ArmoryMember, 'email' | 'checkouts'>, checkouts: readonly ArmoryCheckout[]): number {
	return member.checkouts ? member.checkouts.length : checkouts.filter((c) => c.holder_email === member.email).length;
}

// ---- Adding people: the picker and the paste box run ONE loop ----

/** A member write's answer. `code` is the SQLSTATE, read before the text (`memberErrorWords`). */
export type MemberOutcome = { ok: true } | { ok: false; message: string; code?: string };

export interface AddPeopleResult {
	added: string[];
	already: string[];
	failed: Array<{ email: string; why: string }>;
}

/**
 * One person at a time, so one refusal never hides whether the rest landed;
 * the page's reload is suppressed for each (`refresh: false`) and the caller
 * reloads ONCE after, rather than once per person. The picker and the paste
 * box both call this, so they cannot disagree about what "already had that
 * role" means.
 */
export async function addPeople(
	emails: readonly string[],
	role: ArmoryRole,
	members: readonly Pick<ArmoryMember, 'email' | 'role'>[],
	add: (email: string, role: ArmoryRole, opts?: { refresh?: boolean }) => Promise<MemberOutcome>
): Promise<AddPeopleResult> {
	const out: AddPeopleResult = { added: [], already: [], failed: [] };
	for (const email of emails) {
		if (members.some((m) => m.email === email && m.role === role)) {
			out.already.push(email);
			continue;
		}
		const r = await add(email, role, { refresh: false });
		if (r.ok) out.added.push(email);
		else if (r.message === 'nothing changed') out.already.push(email);
		else out.failed.push({ email, why: memberErrorWords(r.message, r.code) });
	}
	return out;
}

/** The one sentence after an add, whichever control started it. */
export function addPeopleWords(result: AddPeopleResult, role: ArmoryRole, label: (email: string) => string = (e) => e): string {
	return [
		result.added.length ? `Added ${result.added.length} as ${ROLE_WORDS[role]}.` : '',
		result.already.length ? `${result.already.length} already had that role.` : '',
		result.failed.length ? `Not added: ${result.failed.map((f) => `${label(f.email)} (${f.why})`).join('; ')}` : ''
	]
		.filter(Boolean)
		.join(' ');
}

/**
 * The roles a person may hand out when adding (what is OFFERED; the RPC
 * decides): a mentor any of the four, a CAD lead students and instructors.
 */
export function addableRoles(role: ArmoryRole | null): ArmoryRole[] {
	if (role === 'mentor') return ['student', 'instructor', 'cad_lead', 'mentor'];
	if (role === 'cad_lead') return ['student', 'instructor'];
	return [];
}

/**
 * The role a viewer manages a project's people WITH, which is not always the
 * role they hold in it. 0233 lets a site admin add and remove people on any
 * project with a mentor's reach (`armory_add_member` and
 * `armory_remove_member` admit `is_admin()`), member or not, so on a database
 * with 0233 (`adminReach`, which the summaries rung licenses) an admin manages
 * as a mentor. Everyone else, and an admin on an older database, manages with
 * the role they hold. What is OFFERED only: the RPC decides.
 */
export function memberManagerRole(role: ArmoryRole | null, adminReach: boolean): ArmoryRole | null {
	return adminReach ? 'mentor' : role;
}

/**
 * THE SCHOOL'S TEACHER ADDRESSES: `role_for_email` (0001) calls an address
 * ending in @boscotech.edu a teacher. Mirrored here only to decide what is
 * OFFERED; the server asks its own function.
 */
export function isTeacherAddress(email: string | null | undefined): boolean {
	return (email ?? '').trim().toLowerCase().endsWith('@boscotech.edu');
}

/**
 * WHO IS OFFERED THE PEOPLE SEARCH: a site admin, or a mentor of THIS project
 * whose own address is a school teacher's. `armory_people_search` (0233)
 * refuses everyone else with 42501, because the search is a name-to-address
 * directory of every school account and a mentor can grant mentor to a
 * student address, so a student holding the mentor role, a CAD lead and a
 * mentor on any other domain use Add by email. The page asks this ONE
 * predicate, so it never offers a control whose only answer is a refusal.
 */
export function peopleSearchOffered(opts: { isAdmin: boolean; role: ArmoryRole | null; email: string | null | undefined }): boolean {
	return opts.isAdmin || (opts.role === 'mentor' && isTeacherAddress(opts.email));
}

/** Why the paste box is the way to add people, for someone the search is not offered to. */
export const PEOPLE_SEARCH_NOT_OFFERED =
	'Finding people by name is for site admins and mentors who are teachers. Add people by their school email.';

// ---- People search (0233 `armory_people_search`) ----

/** One result. Never a uuid; `member_role` is set when they are already in this project. */
export interface ArmoryPersonResult {
	email: string;
	name: string | null;
	avatar: string | null;
	avatar_url: string | null;
	pathway: string | null;
	member_role: ArmoryRole | null;
}

/** The search answers nothing under this many characters, and so does the box. */
export const PEOPLE_SEARCH_MIN = 2;
/** At most this many results are asked for. */
export const PEOPLE_SEARCH_LIMIT = 12;
/** The wait after the last keystroke before the search is asked. */
export const PEOPLE_SEARCH_DEBOUNCE_MS = 250;

/** Whether a query is long enough to send: two characters that are not spaces. */
export function searchable(query: string): boolean {
	return query.replace(/\s/g, '').length >= PEOPLE_SEARCH_MIN;
}

export type PeopleSearchAnswer =
	| { ok: true; rows: ArmoryPersonResult[] }
	| { ok: false; reason: 'unavailable' | 'refused' | 'failed' };

// ---- Delete forever (0233 `armory_purge_project`) ----

/** What the confirmation box holds, as the RPC compares it: trimmed and NFC. */
export function purgeConfirmValue(typed: string): string {
	return typed.trim().normalize('NFC');
}

/**
 * THE ONE PREDICATE that decides whether Delete forever may be pressed, read by
 * the control (`aria-disabled`) AND by the handler (the `reviewCanSend` rule):
 * two spellings of "is this ready" is how a press does nothing. The RPC
 * compares the NFC-normalized name exactly, so this does too, and the value
 * sent is `purgeConfirmValue(typed)`, never the raw box. A preview that says
 * the purge would be refused (`purgeBlockedWords`) holds the key too, so the
 * refusal is said before the box rather than after the press.
 */
export function purgeCanSend(typed: string, name: string, preview: ArmoryPurgePreview | null = null): boolean {
	const value = purgeConfirmValue(typed);
	return value !== '' && value === name.normalize('NFC') && purgeBlockedWords(preview) === null;
}

/** What the purge route answers the page: the project is gone, plus anything storage could not finish. */
export type PurgeAnswer = { ok: true; storageProblem: string | null } | { ok: false; message: string };

/** `armory_purge_preview` (0233): what Delete forever will remove. */
export interface ArmoryPurgePreview {
	name: string;
	folder?: string | null;
	files: number;
	live_files: number;
	versions: number;
	side_versions: number;
	checkouts: number;
	/** Stored files nothing else names, which are actually freed. */
	blobs: number;
	bytes: number;
	/** 0233 also says whether the purge would go through, and why not. */
	archived?: boolean;
	referenced_elsewhere?: number;
	can_purge?: boolean;
}

/**
 * Why Delete forever would be refused, said before the box; null when the
 * preview does not say (or was not read), and the server decides at the press.
 * `armory_purge_project` refuses an unarchived project (55000) and one whose
 * versions another file's history names (55006, which refuses rather than
 * break that history).
 */
export function purgeBlockedWords(preview: ArmoryPurgePreview | null): string | null {
	if (!preview || preview.can_purge !== false) return null;
	if (preview.archived === false) return 'Archive the project first. Delete forever is offered only for an archived project.';
	const n = preview.referenced_elsewhere ?? 0;
	if (n > 0) {
		return `The history of ${count(n, 'file', 'files')} in another project names a version of a file here, so this project cannot be deleted forever without breaking that history. Nothing will be deleted.`;
	}
	return 'The server says this project cannot be deleted forever right now. Nothing will be deleted.';
}

function count(n: number, one: string, many: string): string {
	return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** The cost of Delete forever, in real counts, said before the box. */
export function purgeCostWords(preview: ArmoryPurgePreview, size: (bytes: number) => string): string {
	const removed = Math.max(0, preview.files - preview.live_files);
	const parts = [
		`${count(preview.files, 'file', 'files')}${removed > 0 ? ` (${removed.toLocaleString('en-US')} already removed)` : ''}`,
		count(preview.versions, 'version', 'versions'),
		count(preview.side_versions, 'side version', 'side versions'),
		'its member list and its activity'
	];
	const out = preview.checkouts > 0 ? ` ${count(preview.checkouts, 'checkout is', 'checkouts are')} released.` : '';
	const freed =
		preview.blobs > 0
			? ` ${size(preview.bytes)} of stored files (${count(preview.blobs, 'file', 'files')}) are removed from storage; content another project also saved is kept.`
			: ' Every stored file it used is also used by another project, so nothing is removed from storage.';
	return `Deletes ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.${out}${freed} This cannot be undone.`;
}
