/**
 * ONE LIVE SHARED DOCUMENT PER TEAM, THE CLIENT'S HALF (ledger 0436, 0302).
 *
 * A ported worksheet whose manifest declares `team` is a team assignment: a
 * `team` module holds one answer per block per team, a `role` module belongs
 * to the member who owns that role in the team plan, and every other module is
 * the student's own. The DATABASE decides who may write (0302's
 * `_classroom_team_block_refusal` and the box lock); everything here only
 * draws that answer and keeps a student from typing into a box the server
 * would refuse anyway. No DOM, no Svelte: every rule can be put to a value in
 * `tests/` with no browser.
 *
 * WHAT A PAGE DOES WITH IT. `classroom_team_document` is read on load, on the
 * team's live notice and on the section's (`teams`: a draw posted, unposted or
 * edited), and `teamValuesFor` lays the team's stored answers over the
 * student's own copy of them (`HxAnswers.adoptRemote`, which never overwrites
 * unsaved typing). `teamFieldStates` is what the document is told, per field,
 * as `idea:team-state`.
 */

import type { HtmlAssignmentManifest } from './manifest';
import { HX_REFUSALS, hxBridgeValue } from './answers';
import { submissionFileSrc, type ResponseValue } from '$lib/classroom/assignment-spec';
import type { HxImageState } from './bridge';

/** Who writes a block of a team assignment. Null for an individual or header block. */
export type HxTeamAudience = { audience: 'team' } | { audience: 'role'; role: string };

/** The block ids a team manifest shares, with who writes each. Empty for a manifest without `team`. */
export function hxTeamBlocks(manifest: HtmlAssignmentManifest | null | undefined): Map<string, HxTeamAudience> {
	const out = new Map<string, HxTeamAudience>();
	const team = (manifest as { team?: unknown } | null | undefined)?.team;
	if (!manifest || !team || typeof team !== 'object' || Array.isArray(team)) return out;
	for (const mod of manifest.modules ?? []) {
		const who: HxTeamAudience | null =
			mod.audience === 'team'
				? { audience: 'team' }
				: mod.audience === 'role' && typeof mod.role === 'string'
					? { audience: 'role', role: mod.role }
					: null;
		if (!who) continue;
		for (const b of mod.blocks ?? []) out.set(b.id, who);
	}
	return out;
}

/** True when the manifest declares `team`, which is what makes an item a team assignment. */
export function hxIsTeamManifest(manifest: unknown): boolean {
	const team = (manifest as { team?: unknown } | null | undefined)?.team;
	return !!team && typeof team === 'object' && !Array.isArray(team);
}

export interface TeamDocument {
	team: { id: string; name: string; number: number; section_id?: string } | null;
	/** Why there is no team: 'not_posted', 'no_team', or 'not_team_assignment'. */
	reason: string | null;
	/** The section whose live channel announces a draw being posted. */
	sectionId: string | null;
	members: { name: string; me: boolean; active: boolean }[];
	roles: { id: string; title: string; owner: string | null; mine: boolean }[];
	values: Record<string, { value: unknown; by: string | null; at: string | null }>;
	locks: Record<string, { by: string; mine: boolean; until: string }>;
	pastDue: boolean;
	/** The server's clock when it answered, so a lock's end is judged on its clock. */
	serverNow: string | null;
	/**
	 * The phases this team's post waits on (0323, `opensAfter`): checkpoint key
	 * to whether it is open for this team, its title and its date. Empty before
	 * 0323 and for a post with no phases.
	 */
	phases: Record<string, { open: boolean; title: string; date: string | null }>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * THE RPC'S ANSWER, READ DEFENSIVELY. A payload is data from the server, but a
 * page keeps working on a database that predates a key: an absent array is
 * empty and an absent object is `{}`.
 */
export function parseTeamDocument(raw: unknown): TeamDocument | null {
	if (!isRecord(raw) || raw.ok !== true) return null;
	const team = isRecord(raw.team)
		? {
				id: String(raw.team.id),
				name: String(raw.team.name ?? ''),
				number: Number(raw.team.number ?? 0),
				section_id: raw.team.section_id ? String(raw.team.section_id) : undefined
			}
		: null;
	const arr = (v: unknown) => (Array.isArray(v) ? v : []);
	const obj = (v: unknown) => (isRecord(v) ? v : {});
	return {
		team,
		reason: typeof raw.reason === 'string' ? raw.reason : null,
		sectionId: typeof raw.section_id === 'string' ? raw.section_id : (team?.section_id ?? null),
		members: arr(raw.members).filter(isRecord).map((m) => ({
			name: String(m.name ?? ''),
			me: m.me === true,
			active: m.active !== false
		})),
		roles: arr(raw.roles).filter(isRecord).map((r) => ({
			id: String(r.id),
			title: String(r.title ?? r.id),
			owner: typeof r.owner === 'string' ? r.owner : null,
			mine: r.mine === true
		})),
		values: Object.fromEntries(
			Object.entries(obj(raw.values)).flatMap(([k, v]) =>
				isRecord(v)
					? [[k, { value: v.value, by: typeof v.by === 'string' ? v.by : null, at: typeof v.at === 'string' ? v.at : null }]]
					: []
			)
		),
		locks: Object.fromEntries(
			Object.entries(obj(raw.locks)).flatMap(([k, v]) =>
				isRecord(v) ? [[k, { by: String(v.by ?? ''), mine: v.mine === true, until: String(v.until ?? '') }]] : []
			)
		),
		pastDue: raw.past_due === true,
		serverNow: typeof raw.now === 'string' ? raw.now : null,
		phases: Object.fromEntries(
			Object.entries(obj(raw.phases)).flatMap(([k, v]) =>
				isRecord(v)
					? [[k, { open: v.open === true, title: String(v.title ?? k), date: typeof v.date === 'string' ? v.date : null }]]
					: []
			)
		)
	};
}

/**
 * THE WORDS, ONCE. The first is Mr. Pina's, verbatim (addendum of
 * 2026-10-26): what a student opening a team post sees before the class's
 * teams are posted. No error and no empty form.
 */
export const TEAM_DOC_WORDS = {
	notPosted: "Teams are drawn in class. Your team's document opens here the moment teams are posted.",
	noTeam: "Your class has teams, and you are not on one yet. Tell your teacher, and your team's document opens here as soon as you are added.",
	pastDue: "This post is past its due date, so your team's answers are read only.",
	ownedBy: (role: string, who: string) => `${role} belongs to ${who}. You can read it as they work.`,
	noOwner: (role: string) => `${role} has no owner yet. Choose who owns it in your team plan, then they can write here.`,
	editing: (who: string) => `${who} is editing`,
	later: (checkpoint: string) => `Opens when your team's ${checkpoint} sign-off is approved, or on its date.`
} as const;

/** What a refused team save says, in the student's terms. `by` is a first name when the server gave one. */
export function teamRefusalWords(reason: string | undefined, by?: string | null): string | null {
	switch (reason) {
		case 'held':
			return `${by || 'A teammate'} is editing this box right now. It opens for you when they click away.`;
		case 'not_owner':
			return `This part belongs to ${by || 'a teammate'}, so only they can change it.`;
		case 'no_owner':
			return 'Nobody owns this part yet. Choose its owner in your team plan first.';
		case 'not_posted':
			return TEAM_DOC_WORDS.notPosted;
		case 'no_team':
			return TEAM_DOC_WORDS.noTeam;
		case 'past_due':
			return TEAM_DOC_WORDS.pastDue;
		case 'locked':
			return HX_REFUSALS.locked;
		case 'not_open':
			return TEAM_DOC_WORDS.later(by || 'next');
		default:
			return null;
	}
}

/**
 * ONE FIELD'S STATE, AS THE DOCUMENT IS TOLD IT. `free` and `mine` may be
 * typed into; the rest are read only, and `by` names who to wait for.
 */
export type HxTeamFieldStateKind = 'free' | 'mine' | 'held' | 'owned' | 'unowned' | 'closed' | 'later';
export interface HxTeamFieldState {
	state: HxTeamFieldStateKind;
	/** A first name: who is editing, or who owns the part. */
	by?: string;
	/**
	 * A table's rows a teammate holds (ledger 0456, 0318): row index to their
	 * first name. The rest of the table is free; the document shuts only these.
	 */
	rows?: Record<string, string>;
}

/** A row lock's key, `<block>#r<n>` (0318). */
export function teamRowKey(blockId: string, row: number): string {
	return `${blockId}#r${row}`;
}

export function teamFieldWritable(state: HxTeamFieldState | undefined): boolean {
	return !state || state.state === 'free' || state.state === 'mine';
}

/**
 * EVERY SHARED FIELD'S STATE NOW. `nowMs` is the viewer's clock corrected to
 * the server's (`skewMs` = server minus client), so a lock's two minutes are
 * the database's two minutes.
 */
export function teamFieldStates(
	manifest: HtmlAssignmentManifest,
	doc: TeamDocument,
	nowMs: number,
	skewMs = 0
): Record<string, HxTeamFieldState> {
	const out: Record<string, HxTeamFieldState> = {};
	const blocks = hxTeamBlocks(manifest);
	const fieldOf = new Map<string, string>();
	for (const mod of manifest.modules ?? []) for (const b of mod.blocks ?? []) fieldOf.set(b.id, b.field);
	const roles = new Map(doc.roles.map((r) => [r.id, r]));
	const serverNow = nowMs + skewMs;
	// 0323: a module that opens after a checkpoint this team has not passed is
	// read only, shared or individual, with the checkpoint's title as `by`.
	const laterOf = new Map<string, string>();
	for (const mod of manifest.modules ?? []) {
		const key = (mod as { opensAfter?: unknown }).opensAfter;
		const phase = typeof key === 'string' ? doc.phases[key] : undefined;
		if (!phase || phase.open) continue;
		for (const b of mod.blocks ?? []) laterOf.set(b.id, phase.title);
	}
	for (const [blockId, title] of laterOf) {
		const field = fieldOf.get(blockId);
		if (field && !blocks.has(blockId) && !doc.pastDue) out[field] = { state: 'later', by: title };
	}
	for (const [blockId, who] of blocks) {
		const field = fieldOf.get(blockId);
		if (!field) continue;
		if (doc.pastDue) {
			out[field] = { state: 'closed' };
			continue;
		}
		if (laterOf.has(blockId)) {
			out[field] = { state: 'later', by: laterOf.get(blockId) };
			continue;
		}
		if (who.audience === 'role') {
			const role = roles.get(who.role);
			if (!role?.owner) {
				out[field] = { state: 'unowned' };
				continue;
			}
			if (!role.mine) {
				out[field] = { state: 'owned', by: role.owner };
				continue;
			}
		}
		const lock = doc.locks[blockId];
		const fresh = lock && Date.parse(lock.until) > serverNow;
		if (fresh && lock.mine) out[field] = { state: 'mine' };
		else if (fresh) out[field] = { state: 'held', by: lock.by };
		else out[field] = { state: 'free' };
		// 0318: a table locks by row. Rows a teammate holds go down with the field.
		const rows: Record<string, string> = {};
		for (const [key, l] of Object.entries(doc.locks)) {
			const m = /^(.*)#r(\d{1,3})$/.exec(key);
			if (!m || m[1] !== blockId || l.mine || !(Date.parse(l.until) > serverNow)) continue;
			rows[m[2]] = l.by;
		}
		if (Object.keys(rows).length) out[field] = { ...out[field], rows };
	}
	return out;
}

/** The soonest a held lock runs out, so a page can redraw at that moment with no network. */
export function teamNextLockChange(doc: TeamDocument, nowMs: number, skewMs = 0): number | null {
	const serverNow = nowMs + skewMs;
	let soonest: number | null = null;
	for (const lock of Object.values(doc.locks)) {
		const end = Date.parse(lock.until);
		if (!Number.isFinite(end) || end <= serverNow) continue;
		if (soonest === null || end < soonest) soonest = end;
	}
	return soonest === null ? null : soonest - skewMs;
}

/**
 * THE TEAM'S ANSWERS, KEYED BY FIELD, for every shared field: the team's stored
 * value, or empty when the team has none (a moved student's own copy of the
 * old team's work must not show). A checkbox's empty is `false`.
 */
export function teamValuesFor(manifest: HtmlAssignmentManifest, doc: TeamDocument): Record<string, string | boolean> {
	const out: Record<string, string | boolean> = {};
	const blocks = hxTeamBlocks(manifest);
	for (const mod of manifest.modules ?? []) {
		for (const b of mod.blocks ?? []) {
			if (!blocks.has(b.id) || b.type === 'image') continue;
			// Stored in the ordinary answer shape (`hxStoredValue`), so read back
			// through the one reader of it, `hxBridgeValue`.
			const stored = hxBridgeValue(doc.values[b.id]?.value as ResponseValue | null | undefined);
			out[b.field] = stored ?? (b.type === 'checkbox' ? false : '');
		}
	}
	return out;
}

/** The message the document receives, as one plain object. */
export interface HxTeamStatePayload {
	team: string;
	me: string;
	roles: { id: string; title: string; owner: string | null; mine: boolean }[];
	fields: Record<string, HxTeamFieldState>;
}

export function teamStatePayload(
	manifest: HtmlAssignmentManifest,
	doc: TeamDocument,
	nowMs: number,
	skewMs = 0
): HxTeamStatePayload | null {
	if (!doc.team) return null;
	return {
		team: doc.team.name,
		me: doc.members.find((m) => m.me)?.name ?? '',
		roles: doc.roles,
		fields: teamFieldStates(manifest, doc, nowMs, skewMs)
	};
}

/** The waiting sentence for a student with no team document, or null when there is one. */
export function teamWaitingWords(doc: TeamDocument | null): string | null {
	if (!doc || doc.team) return null;
	if (doc.reason === 'not_posted') return TEAM_DOC_WORDS.notPosted;
	if (doc.reason === 'no_team') return TEAM_DOC_WORDS.noTeam;
	return null;
}

/** The live channel key one team's document is announced on (0302's `'team-' || id`). */
export function teamLiveKey(teamId: string): string {
	return `team-${teamId}`;
}

/** What an instructor's team documents panel reads through (0302's three manager reads). */
export interface TeamDocumentsTransports {
	listTeams(itemId: string): Promise<unknown>;
	readTeam(itemId: string, teamId: string): Promise<unknown>;
	history(itemId: string, teamId: string, blockId: string): Promise<unknown>;
	/** The teams panel's read (`classroom_item_signoff_board`, 0323); absent in an older harness. */
	board?(itemId: string): Promise<unknown>;
	/** The post's late classes (`classroom_item_section_shifts`, 0324). */
	shifts?(itemId: string): Promise<unknown>;
	/** One class runs the post N school days late (`classroom_item_section_shift_set`, 0324). */
	setShift?(itemId: string, sectionId: string, days: number): Promise<{ ok: boolean; reason?: string } | null>;
	/** Decide one team's checkpoint (`classroom_signoff_teacher_decide`, 0323). */
	decide?(
		teamId: string,
		key: string,
		results: Record<string, boolean>,
		approve: boolean,
		note: string | null
	): Promise<{ ok: boolean; reason?: string } | null>;
}

/**
 * THE TEAM'S PICTURES, KEYED BY FIELD (0316), from `classroom_team_files`. Only
 * team and role boxes of this manifest; a row the manifest does not declare is
 * dropped. Pure, so a test can put a payload to it.
 */
export function teamImagesFrom(manifest: HtmlAssignmentManifest, raw: unknown): Record<string, HxImageState> {
	const out: Record<string, HxImageState> = {};
	const files = (raw as { ok?: boolean; files?: unknown } | null)?.files;
	if (!Array.isArray(files)) return out;
	const blocks = hxTeamBlocks(manifest);
	const fieldOf = new Map<string, string>();
	for (const mod of manifest.modules ?? []) for (const b of mod.blocks ?? []) fieldOf.set(b.id, b.field);
	for (const f of files) {
		if (!f || typeof f !== 'object') continue;
		const row = f as { id?: unknown; block_id?: unknown; filename?: unknown; caption?: unknown };
		const blockId = typeof row.block_id === 'string' ? row.block_id : '';
		const field = fieldOf.get(blockId);
		if (!field || !blocks.has(blockId) || typeof row.id !== 'string') continue;
		out[field] = {
			url: submissionFileSrc(row.id),
			name: typeof row.filename === 'string' ? row.filename : 'picture',
			caption: typeof row.caption === 'string' ? row.caption : ''
		};
	}
	return out;
}
