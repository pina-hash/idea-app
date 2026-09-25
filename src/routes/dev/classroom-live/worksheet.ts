/**
 * A PORTED HTML WORKSHEET ON THE LIVE GRID (decision 37, ledger 0298, the
 * consistency follow-up to Tier A item 3). Its own file so the fixture the
 * projector harness shares (`fixture.ts`) is untouched, and the worksheet item
 * is added to the chooser only when `?item=i-gears` asks for it, so every
 * other live spec measures exactly the page it always did.
 *
 * WHAT THE STUDENTS HAVE DONE, in offsets against the real clock (a literal
 * would drift past the due instant and go on looking plausible):
 *   Gus    finished both blocks two days ago, before the due time; no row.
 *   Kim    finished, the last block two hours ago, after the due time; no row.
 *   Hana   answered one block of two; no row. Still Missing.
 *   Jo     finished, and was graded (a draft row carrying `graded_at`).
 *   Lee    finished, and was graded and returned.
 *   Ivan   answered the block Hana did not: a classmate's answer finishes
 *          nobody's worksheet.
 * Everybody else has nothing, and the grading read is the same shape the
 * real `loadGrading` returns; the manifest arrives beside it through the SAME
 * `withWorksheetManifest` the live route uses.
 */
import type { ClassroomItem } from '$lib/classroom/classroom';
import type { GradingData, ResponseRow, SubmissionRow } from '$lib/classroom/assignment-spec';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { ROSTER } from './fixture';

export const WORKSHEET_ID = 'i-gears';

const ago = (seconds: number, now = Date.now()) => new Date(now - seconds * 1000).toISOString();

/** Due yesterday evening: long enough ago that a missing worksheet is Missing on any run. */
export function worksheetItem(now = Date.now()): ClassroomItem {
	return {
		id: WORKSHEET_ID,
		kind: 'assignment',
		title: 'Gear train worksheet',
		body: '',
		points: 4,
		category: null,
		author_email: 'pina@boscotech.edu',
		author_name: 'Mr. Pina',
		published: true,
		pinned: false,
		publish_at: null,
		due_at: ago(18 * 3600, now),
		first_published_at: ago(4 * 86_400, now),
		assignment_schema_version: 3
	} as unknown as ClassroomItem;
}

const level = (points: number, label: string) => ({ points, label, short: label, descriptor: `${label} work.` });

export const WORKSHEET_MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gear train worksheet',
	course: 'IDEA209H',
	points: 4,
	header: [],
	modules: [
		{
			id: 'm1',
			title: 'Ratio',
			points: 2,
			blocks: [{ id: 'm1-ratio', field: 'ratio', type: 'text' }],
			criteria: [{ id: 'c1', text: 'Ratio', points: 2, levels: [level(2, 'Full'), level(1, 'Part'), level(0, 'None')] }]
		},
		{
			id: 'm2',
			title: 'Why',
			points: 2,
			blocks: [{ id: 'm2-why', field: 'why', type: 'longText' }],
			criteria: [{ id: 'c2', text: 'Why', points: 2, levels: [level(2, 'Full'), level(1, 'Part'), level(0, 'None')] }]
		}
	]
};

const answer = (email: string, block: string, secondsAgo: number, now: number): ResponseRow => ({
	item_id: WORKSHEET_ID,
	student_email: email,
	block_id: block,
	value: { text: 'The driver has 12 teeth and the driven gear has 36.' },
	updated_at: ago(secondsAgo, now)
});

const sub = (email: string, over: Partial<SubmissionRow>): SubmissionRow =>
	({
		id: `sub-ws-${email}`,
		item_id: WORKSHEET_ID,
		student_email: email,
		state: 'draft',
		submitted_at: null,
		returned_at: null,
		rubric_scores: null,
		criterion_comments: null,
		score: null,
		teacher_comment: null,
		graded_by: null,
		graded_at: null,
		...over
	}) as SubmissionRow;

/** The grading read for the worksheet: answers only, as a saved answer creates no submission row. */
export function worksheetGrading(now = Date.now()): GradingData {
	const DAY = 86_400;
	return {
		roster: ROSTER,
		submissions: [
			sub('jo@boscotech.net', { graded_at: ago(3600, now), graded_by: 'pina@boscotech.edu', score: 4 }),
			sub('lee@boscotech.net', {
				state: 'returned',
				graded_at: ago(3000, now),
				returned_at: ago(3000, now),
				graded_by: 'pina@boscotech.edu',
				score: 3
			})
		],
		responses: [
			answer('gus@boscotech.net', 'm1-ratio', 2 * DAY + 600, now),
			answer('gus@boscotech.net', 'm2-why', 2 * DAY, now),
			answer('kim@boscotech.net', 'm1-ratio', 2 * DAY, now),
			answer('kim@boscotech.net', 'm2-why', 2 * 3600, now),
			answer('hana@boscotech.net', 'm1-ratio', DAY + 3600, now),
			answer('ivan@boscotech.net', 'm2-why', DAY + 3600, now),
			answer('jo@boscotech.net', 'm1-ratio', 2 * DAY, now),
			answer('jo@boscotech.net', 'm2-why', 2 * DAY, now),
			answer('lee@boscotech.net', 'm1-ratio', 2 * DAY, now),
			answer('lee@boscotech.net', 'm2-why', 2 * DAY, now)
		],
		files: [],
		approvals: []
	};
}
