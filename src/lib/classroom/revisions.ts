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
	| { status: 'failed'; error: string; slug: string | null; kind: ExportFailureKind };

/**
 * WHY AN EXPORT FAILED, coarsely enough to be worth different words.
 *
 * These are not shades of the same thing. A `collision` means someone else
 * committed to main while this export was being assembled: nothing is wrong,
 * nothing was lost, and pressing Retry genuinely fixes it. A `refused` means
 * GitHub will not accept this write at all -- the token's access, or a rule on
 * the branch -- and Retry will produce the identical refusal forever. Telling a
 * teacher to retry something that cannot succeed, or telling them a two-second
 * race needs an administrator, are both worse than saying nothing.
 *
 * `unknown` is deliberately kept rather than folded into one of the others: a
 * refusal this build has never seen must not be described with confidence.
 */
export type ExportFailureKind = 'collision' | 'refused' | 'network' | 'unknown';

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

/**
 * The sentence a failure is RECORDED as, and the only thing the chip has to go
 * on after a reload.
 *
 * `classroom_record_export` stores one text column, so the stored string is the
 * whole durable channel -- a `kind` field alongside it would be lost the moment
 * the page reloaded and the status came back from the database. So the class is
 * encoded in words a teacher can read, and `classifyExportError` reads those
 * same words back out. The two must be changed together, which is why they live
 * in one file and share the marker constants below.
 *
 * GitHub's own text is kept in parentheses at the end. It is the only thing that
 * makes a report actionable for whoever holds the token, and dropping it to keep
 * the sentence tidy would trade a real diagnosis for a tidier one.
 */
const KIND_MARKERS = {
	collision: 'another commit landed on main',
	refused: 'github refused this export',
	network: 'could not reach github'
} as const;

export function exportFailureMessage(kind: ExportFailureKind, detail: string): string {
	const tail = detail ? ` (${detail})` : '';
	switch (kind) {
		case 'collision':
			return `Another commit landed on main while this export was being written. Nothing was lost and nothing is wrong -- press Retry.${tail}`;
		case 'refused':
			return `GitHub refused this export outright, and retrying will not change that: the export token's access, or a protection rule on main, needs attention.${tail}`;
		case 'network':
			return `Could not reach GitHub. The content itself saved; press Retry once the connection is back.${tail}`;
		default:
			return detail || 'The export failed.';
	}
}

/**
 * The class of a failure read back OUT of a stored message.
 *
 * Matches only phrases this module itself writes, so a message that came from
 * somewhere else -- an older build, a route's own catch -- classifies as
 * `unknown` and is shown verbatim rather than being confidently mislabelled.
 */
export function classifyExportError(message: string | null | undefined): ExportFailureKind {
	const text = (message ?? '').toLowerCase();
	if (!text) return 'unknown';
	for (const [kind, marker] of Object.entries(KIND_MARKERS)) {
		if (text.includes(marker)) return kind as ExportFailureKind;
	}
	return 'unknown';
}

/** The chip's own word for a failure class. Amber either way; the words differ. */
export function exportFailureLabel(kind: ExportFailureKind): string {
	switch (kind) {
		case 'collision':
			return 'Export needs a retry';
		case 'refused':
			return 'Export refused';
		case 'network':
			return 'Export could not reach GitHub';
		default:
			return 'Export failed';
	}
}
