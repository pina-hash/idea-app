/**
 * THE REVIEW QUEUE'S ARITHMETIC AND ITS FIXED LISTS.
 *
 * Plain data and pure functions: no Svelte, no transports, no fetch. What a
 * rejection needs before it can be sent, which reasons exist, and what the
 * metadata flag actually licenses a reviewer to say are all decided here, so
 * the component renders a decision it did not make and a test can assert the
 * decision without a browser.
 */

import type { FoundryApp, FoundryVersion } from './transports.ts';

/**
 * THE REJECT REASONS, AND WHY THEY ARE A FIXED LIST WITH A FREE NOTE BESIDE
 * THEM RATHER THAN EITHER ONE ALONE.
 *
 * The reason is a CATEGORY: it makes rejections countable, it makes the same
 * problem read the same way in front of two different reviewers, and it gives
 * a student a word they can look up. The note is the SENTENCE: what is wrong
 * with THIS build, which no category can carry. `foundry_review_version`
 * already refuses a rejection with no note by name (0130), and this list is
 * what stops the note from also having to carry the category.
 *
 * THE `id` IS WHAT IS STORED, in `student_app_versions.reject_reason`, which is
 * free text up to 200 characters -- so the database is not enforcing this list
 * and a reason typed straight into the RPC would be stored happily. That is
 * accepted rather than migrated around: the list exists to make the console's
 * output consistent, not to constrain what the schema can hold, and pinning it
 * in SQL would mean a migration every time a category is added.
 *
 * KEEP THEM SHORT AND ABOUT THE BUILD. A reason is shown to the student beside
 * the note, so each one has to be a thing they can act on. "Not good enough" is
 * not a category, it is a verdict with no next step.
 */
export const FOUNDRY_REJECT_REASONS = [
	{
		id: 'does-not-run',
		label: 'Does not run',
		hint: 'The entry page loads but the app does not start, or it errors immediately.'
	},
	{
		id: 'incomplete',
		label: 'Unfinished',
		hint: 'Placeholder text, dead controls, or a feature that is clearly half-built.'
	},
	{
		id: 'not-your-work',
		label: 'Attribution unclear',
		hint: 'The build notes do not say what was generated, borrowed, or written by hand.'
	},
	{
		id: 'content',
		label: 'Content',
		hint: 'Something in the app is not appropriate for a school gallery.'
	},
	{
		id: 'metadata',
		label: 'Description or title',
		hint: 'The build runs, but the text around it does not describe it.'
	},
	{
		id: 'other',
		label: 'Something else',
		hint: 'Use the note. Prefer one of the categories above when one fits.'
	}
] as const;

export type FoundryRejectReasonId = (typeof FOUNDRY_REJECT_REASONS)[number]['id'];

export function rejectReasonLabel(id: string | null | undefined): string | null {
	const found = FOUNDRY_REJECT_REASONS.find((r) => r.id === id);
	return found ? found.label : (id ?? null);
}

export type FoundryDecision = 'approve' | 'reject';

/**
 * WHETHER A DECISION CAN BE SENT AT ALL, as one predicate both the button's
 * disabled state and the submit handler read.
 *
 * Two spellings of "is this ready" is the thing that stops agreeing: a button
 * that enables on one rule and a handler that checks another produces a click
 * that does nothing, with no message, which reads as a broken page.
 *
 * AN APPROVAL NEEDS NOTHING. A note on an approval is welcome and optional --
 * `foundry_review_version` stores it either way -- because the student's next
 * action after an approval is nothing at all.
 *
 * A REJECTION NEEDS BOTH A NOTE AND A REASON. The note is required by the
 * DATABASE (0130 raises without one), so requiring it here is mirroring a rule
 * rather than inventing one; the reason is this surface's own requirement, and
 * the reason it is required is that a rejection whose category is "other"
 * because nobody picked one is a rejection nobody can count.
 */
export function reviewCanSend(input: {
	decision: FoundryDecision | null;
	note: string;
	reasonId: string | null;
}): boolean {
	if (input.decision === 'approve') return true;
	if (input.decision !== 'reject') return false;
	if (input.note.trim().length === 0) return false;
	return FOUNDRY_REJECT_REASONS.some((r) => r.id === input.reasonId);
}

/**
 * The sentence shown beside a disabled Send, so the control explains itself
 * rather than sitting greyed out (`aria-disabled`, not `disabled`, at the call
 * site -- a genuinely disabled control swallows the pointer events a "why is
 * this off" cue would need).
 */
export function reviewBlockedBecause(input: {
	decision: FoundryDecision | null;
	note: string;
	reasonId: string | null;
}): string | null {
	if (reviewCanSend(input)) return null;
	if (!input.decision) return 'Choose approve or send back first.';
	const missing: string[] = [];
	if (!FOUNDRY_REJECT_REASONS.some((r) => r.id === input.reasonId)) missing.push('a reason');
	if (input.note.trim().length === 0) missing.push('a note saying what to change');
	return `Sending back needs ${missing.join(' and ')}.`;
}

/**
 * WHAT THE METADATA FLAG CAN HONESTLY SAY, WHICH IS LESS THAN "WHAT CHANGED".
 *
 * `student_apps.metadata_flagged_at` is a TIMESTAMP and nothing else. 0130
 * stamps it on the first real change to a published app's title, tagline,
 * description, cover or build notes, and deliberately does not re-stamp while
 * it is already set, because the first unreviewed edit is when the drift
 * started. What it does NOT record is WHICH field moved or what it said
 * before: there is no metadata history table, the version manifest carries
 * build facts only, and nothing anywhere holds the approved copy of the text.
 *
 * SO THIS DOES NOT INVENT A DIFF. It reports the two timestamps that ARE known
 * -- when the drift started, and which approval it drifted from -- and names
 * the fields that are capable of having moved, which is the honest boundary of
 * what the schema supports. A per-field diff would need a migration; the
 * reviewer reads the current text beside the running build, which is what they
 * have to do anyway before clearing the flag.
 *
 * Returns null when there is nothing to say, so the panel is ABSENT rather than
 * rendering an empty state.
 */
export function metadataDrift(
	app: Pick<FoundryApp, 'metadata_flagged_at' | 'published_version_id' | 'versions'>
): { flaggedAt: string; approvedAt: string | null; fields: string[] } | null {
	if (!app.metadata_flagged_at) return null;
	const live = app.versions.find((v) => v.id === app.published_version_id) ?? null;
	return {
		flaggedAt: app.metadata_flagged_at,
		approvedAt: live?.reviewed_at ?? null,
		// The five fields `foundry_update_app_metadata` accepts. Stated here as
		// the set that COULD have moved, never as a claim that all of them did.
		fields: ['Name', 'Tagline', 'Description', 'Cover image', 'How this was built']
	};
}

/**
 * THE QUEUE'S ROWS: every app with a version waiting, oldest submission first.
 *
 * OLDEST FIRST IS THE WHOLE ORDERING ARGUMENT. A queue sorted newest-first is a
 * queue whose bottom never gets read; a student who submitted on Monday must
 * not be overtaken every time somebody submits on Friday.
 *
 * `submitted_version_id` is what says an app is in the queue at all (0130
 * allows at most one submitted version per app), and `updated_at` is the
 * timestamp it is ordered by: `foundry_submit_version` stamps
 * `student_apps.updated_at = now()` on its way past, so on a row that IS in the
 * queue it is the submission time.
 *
 * THE KNOWN WRINKLE, stated rather than papered over: `updated_at` also moves
 * when the author edits their title or description, so editing the text while
 * waiting sends that app to the BACK of the queue. The list row carries no
 * other candidate -- the submitted version's own `created_at` is not projected
 * on it, only its id -- so doing better would cost a second read per row. The
 * cost of getting it wrong is a few days of extra wait, and the metadata flag
 * beside the row is what tells the reviewer an edit happened at all.
 */
export function queueOrder<T extends { submitted_version_id: string | null; updated_at: string }>(
	rows: T[]
): T[] {
	return rows
		.filter((r) => r.submitted_version_id !== null)
		.slice()
		.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
}

/** The submitted version of an app, which is what the queue is deciding about. */
export function versionUnderReview(app: FoundryApp): FoundryVersion | null {
	return app.versions.find((v) => v.status === 'submitted') ?? null;
}

/**
 * A FILE TREE FROM A FLAT PATH LIST, as nested nodes.
 *
 * The bundle is stored as flat `student_app_files` rows because that list IS
 * the proxy's allowlist -- an exact-string lookup with no directory to walk.
 * A reviewer, though, reads a bundle as a tree, so the shape is rebuilt HERE,
 * for display only, and nothing about serving consults it.
 *
 * Directories sort before files, then both alphabetically, which is what every
 * file browser does and therefore what a reviewer's eye expects.
 */
export type FoundryTreeNode = {
	name: string;
	path: string;
	kind: 'dir' | 'file';
	byteSize: number;
	contentType: string | null;
	children: FoundryTreeNode[];
};

export function buildFileTree(
	files: { path: string; byteSize: number; contentType: string }[]
): FoundryTreeNode[] {
	const roots: FoundryTreeNode[] = [];

	for (const file of files) {
		const parts = file.path.split('/').filter(Boolean);
		let level = roots;
		let prefix = '';

		for (let i = 0; i < parts.length; i += 1) {
			const name = parts[i];
			prefix = prefix ? `${prefix}/${name}` : name;
			const isLeaf = i === parts.length - 1;
			let node = level.find((n) => n.name === name && n.kind === (isLeaf ? 'file' : 'dir'));
			if (!node) {
				node = {
					name,
					path: prefix,
					kind: isLeaf ? 'file' : 'dir',
					byteSize: isLeaf ? file.byteSize : 0,
					contentType: isLeaf ? file.contentType : null,
					children: []
				};
				level.push(node);
			}
			// A directory's size is the sum of everything under it, accumulated on
			// the way down rather than by a second walk.
			if (!isLeaf) node.byteSize += file.byteSize;
			level = node.children;
		}
	}

	const sort = (nodes: FoundryTreeNode[]): FoundryTreeNode[] => {
		nodes.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const n of nodes) sort(n.children);
		return nodes;
	};

	return sort(roots);
}
