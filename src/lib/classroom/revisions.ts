/**
 * Content revision history: the client-safe layer over 0110.
 *
 * Types + pure display helpers only (the classroom.ts / curriculum.ts
 * convention). Nothing here reaches Supabase; the panel takes transports and
 * the real page wires them to the RPCs.
 *
 * READ THE MIGRATION HEADER FOR WHAT A ROW MEANS. In short: a revision holds
 * the payload that was DISPLACED, and its author and timestamp describe the
 * write that displaced it -- who replaced this content and when -- not who
 * originally wrote it. Every label in this file says "Replaced by" rather than
 * "By" for that reason, and the panel must keep doing so.
 */

import type { AssignmentSpec } from './assignment-spec';
import type { ReferenceSpec } from './reference-spec';

export const REVISION_TARGETS = ['item', 'assignment_spec', 'reference_spec', 'rubric'] as const;
export type RevisionTarget = (typeof REVISION_TARGETS)[number];

/** The item head's snapshot shape, mirroring _classroom_item_payload. */
export interface ItemRevisionPayload {
	title?: string | null;
	body?: string | null;
	body_doc?: unknown;
	points?: number | null;
	due_at?: string | null;
	category?: string | null;
	publish_at?: string | null;
}

export interface ContentRevision {
	id: string;
	target: RevisionTarget;
	revision: number;
	payload: unknown;
	author_email: string | null;
	author_name: string | null;
	supersedes_id: string | null;
	/** Set when a RESTORE displaced this payload; names the revision restored. */
	restored_from_id: string | null;
	created_at: string;
}

export interface RevisionHistory {
	revisions: ContentRevision[];
	/** The LIVE version number per target: one more than the highest recorded. */
	head_revisions: Partial<Record<RevisionTarget, number>>;
}

export interface RevisionTransports {
	load(itemId: string): Promise<{ ok: true; data: RevisionHistory } | { ok: false; message: string }>;
	restore(
		revisionId: string
	): Promise<
		| { ok: true; data: { target: RevisionTarget; restored: number; changed: boolean } }
		| { ok: false; message: string }
	>;
}

/**
 * What one export attempt did.
 *
 * DECLARED HERE, IN THE CLIENT-SAFE MODULE, and imported by
 * $lib/server/classroom-export -- not the other way round. A client module may
 * never import from $lib/server, even for a type: SvelteKit refuses to bundle
 * that directory into client code, and a type-only import that survives a
 * refactor into a value one is a build failure waiting to happen. Types flow
 * out of the shared layer into the server, never back.
 */
export type ExportOutcome =
	| { status: 'skipped'; reason: 'no_token' | 'no_spec' | 'not_found' }
	| { status: 'ok'; sha: string; slug: string; path: string; unchanged: boolean; files: string[] }
	| { status: 'failed'; error: string; slug: string | null };

/** Export bookkeeping, read separately from the item for deploy-ordering reasons. */
export interface ItemExportStatus {
	slug: string | null;
	lastExportAt: string | null;
	lastExportSha: string | null;
	lastExportError: string | null;
}

const TARGET_LABELS: Record<RevisionTarget, string> = {
	item: 'Post content',
	assignment_spec: 'Assignment spec',
	reference_spec: 'Reference document',
	rubric: 'Rubric'
};

export function revisionTargetLabel(target: RevisionTarget): string {
	return TARGET_LABELS[target] ?? target;
}

function isTarget(value: unknown): value is RevisionTarget {
	return typeof value === 'string' && (REVISION_TARGETS as readonly string[]).includes(value);
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * The RPC's jsonb, turned into rows the panel can render.
 *
 * Tolerant on purpose: a row whose target is not one this build knows about is
 * DROPPED rather than rendered as an unlabelled entry. That is the forward
 * case, not a hostile one -- a later migration adding a fifth target would
 * otherwise make an older client show a blank row it cannot describe.
 */
export function normalizeRevisionHistory(raw: unknown): RevisionHistory {
	const obj = (raw ?? {}) as { revisions?: unknown; head_revisions?: unknown };
	const rows = Array.isArray(obj.revisions) ? obj.revisions : [];
	const revisions: ContentRevision[] = [];
	for (const row of rows as Record<string, unknown>[]) {
		if (!row || !isTarget(row.target)) continue;
		revisions.push({
			id: String(row.id),
			target: row.target,
			revision: Number(row.revision ?? 0),
			payload: row.payload ?? null,
			author_email: str(row.author_email),
			author_name: str(row.author_name),
			supersedes_id: str(row.supersedes_id),
			restored_from_id: str(row.restored_from_id),
			created_at: String(row.created_at ?? '')
		});
	}

	const heads: Partial<Record<RevisionTarget, number>> = {};
	const headsRaw = (obj.head_revisions ?? {}) as Record<string, unknown>;
	for (const [key, value] of Object.entries(headsRaw)) {
		if (isTarget(key) && typeof value === 'number') heads[key] = value;
	}

	return { revisions, head_revisions: heads };
}

/** Newest first, ties broken by the higher revision -- the RPC's own order. */
export function sortRevisions(rows: readonly ContentRevision[]): ContentRevision[] {
	return [...rows].sort((a, b) => {
		const t = Date.parse(b.created_at) - Date.parse(a.created_at);
		if (t !== 0 && Number.isFinite(t)) return t;
		return b.revision - a.revision;
	});
}

/**
 * A one-line description of what a revision's payload actually contained, so a
 * reader can tell two entries apart without expanding either.
 *
 * Every branch is defensive: these payloads were written by a possibly older
 * build, and a history panel that throws on a shape it does not recognise is
 * worse than one that says "content".
 */
export function revisionSummary(rev: ContentRevision): string {
	const payload = rev.payload as Record<string, unknown> | null;
	if (!payload || typeof payload !== 'object') return 'No content';

	if (rev.target === 'item') {
		const p = payload as ItemRevisionPayload;
		const title = (p.title ?? '').trim();
		const words = (p.body ?? '').trim().split(/\s+/).filter(Boolean).length;
		const bits: string[] = [title || 'Untitled'];
		if (words) bits.push(`${words} word${words === 1 ? '' : 's'}`);
		if (typeof p.points === 'number') bits.push(`${p.points} pts`);
		return bits.join(' · ');
	}

	if (rev.target === 'assignment_spec') {
		const spec = payload as unknown as AssignmentSpec;
		const modules = Array.isArray(spec.modules) ? spec.modules.length : 0;
		const title = spec.meta?.title?.trim() || 'Untitled spec';
		const points = spec.meta?.totalPoints;
		const bits = [title, `${modules} module${modules === 1 ? '' : 's'}`];
		if (typeof points === 'number') bits.push(`${points} pts`);
		return bits.join(' · ');
	}

	if (rev.target === 'reference_spec') {
		const spec = payload as unknown as ReferenceSpec;
		const sections = Array.isArray(spec.sections) ? spec.sections.length : 0;
		const title = spec.meta?.title?.trim() || 'Untitled document';
		return `${title} · ${sections} section${sections === 1 ? '' : 's'}`;
	}

	// A rubric payload is the criteria ARRAY, not an object -- so it lands here
	// only when it is one, and the guard above already caught anything else.
	const criteria = Array.isArray(rev.payload) ? (rev.payload as Record<string, unknown>[]) : [];
	const total = criteria.reduce((sum, c) => {
		const points = Number(c?.points ?? 0);
		return sum + (Number.isFinite(points) ? points : 0);
	}, 0);
	return `${criteria.length} criteri${criteria.length === 1 ? 'on' : 'a'} · ${total} pts`;
}

/** "Replaced by T. Vargas" -- see the header for why it is never "By". */
export function revisionAuthorLabel(rev: ContentRevision): string {
	const who = rev.author_name ?? rev.author_email;
	return who ? `Replaced by ${who}` : 'Replaced';
}

/**
 * Whether an item's last export attempt failed, for the manage console's chip.
 * A never-exported item (no attempt, no error) is NOT a failure and shows
 * nothing -- absence is the correct signal for "there is nothing to say".
 */
export function exportFailed(status: ItemExportStatus | null | undefined): boolean {
	return !!status?.lastExportError;
}
