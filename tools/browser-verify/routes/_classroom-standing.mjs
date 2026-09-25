/**
 * Shared probes for the /dev/classroom-standing specs (ledger 0298, R14 and
 * R27): what a student owes, read on the REAL class page, the REAL My Classes
 * card (the to-do's own count) and the REAL home feed card as the teacher, over
 * one fixture pinned at 8pm Pacific on 2026-09-24.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */

export const STANDING = '/dev/classroom-standing';

/** The completeness read has answered and the three surfaces are mounted. */
export const STANDING_READY = {
	waitFor: '() => !!document.querySelector(\'[data-testid="standing-ready"] [data-testid="stream-status-missing"]\')',
	timeoutMs: 20000
};

/**
 * EVERY ROW ON THE CLASS PAGE AS "<title> | <work chip> | <check-in chip>",
 * sorted, so the claim is which words sit on which row and not the order the
 * unfiled group happens to take.
 */
export const STANDING_ROWS = `() => [...document.querySelectorAll('[data-testid="standing-student"] [data-testid="item-row"]')].map((r) =>
	[
		r.querySelector('.row-name')?.textContent.trim(),
		r.querySelector('[data-testid="work-status"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? '-',
		[...r.querySelectorAll('[data-testid="item-check-in-status"]')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()).join(', ') || '-'
	].join(' | ')
).sort()`;

/** The class page's Missing chip count beside My Classes' "N missing", which is the to-do's. */
export const STANDING_MISSING = `() => [
	document.querySelector('[data-testid="standing-student"] [data-testid="stream-status-missing"] .find-count')?.textContent.trim() ?? 'absent',
	document.querySelector('[data-testid="standing-my-classes"] [data-testid="class-owed"] .owed-missing')?.textContent.replace(/\\s+/g, ' ').trim() ?? 'absent'
]`;
