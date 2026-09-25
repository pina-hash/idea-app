// tests/classroom-live-worksheet.test.ts
//
// THE LIVE CLASS GRID READS A FINISHED PORTED WORKSHEET THE WAY THE CLASS PAGE
// DOES (decision 37, ledger 0298, the consistency follow-up to Tier A item 3).
//
// WHY A TEST. A wrong answer here is invisible in normal use: a student who
// filled in every block reads "Away · Draft saved" with a Missing mark on the
// teacher's projector-side view while their own class page says Complete, and
// nothing errors. So every reading is pinned in BOTH directions -- with the
// worksheet's manifest (Complete, Complete late, Graded, and the half-done
// student who is still Missing) and without it (exactly the grid it was) --
// and the one thing that may go wrong in production, the manifest read, is
// pinned to degrade to "without it" rather than to "complete" or to a failure.
//
// Expected values are written from the fixture's own stamps, never from the
// functions under test.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	liveCells,
	withWorksheetManifest,
	type LiveGradingData
} from '$lib/classroom/live-class/grid';
import { readWorksheetManifests } from '$lib/classroom/student-work';
import type { GradingData, ResponseRow, SubmissionRow } from '$lib/classroom/assignment-spec';
import type { ClassroomEnrollment, ClassroomItem } from '$lib/classroom/classroom';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const NOW = Date.parse('2026-09-24T17:30:00Z'); // 10:30 Pacific
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
/** Due an hour ago: every reading below is past due, which is when Missing can be said. */
const DUE = ago(60);
const ITEM_ID = 'i-gears';
const ITEM = { id: ITEM_ID, kind: 'assignment', due_at: DUE } as Pick<ClassroomItem, 'id' | 'kind' | 'due_at'>;

const level = (points: number, label: string) => ({ points, label, short: label, descriptor: `${label} work.` });
const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gear train',
	course: 'IDEA100',
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

const enrol = (email: string, name: string): ClassroomEnrollment => ({
	section_id: 's-1',
	student_email: email,
	display_name: name,
	active: true,
	manages: false
});

/** Named so the roster sorts in this order. */
const ROSTER: ClassroomEnrollment[] = [
	enrol('ana@x', 'A Ana'), // finished before the due time, no submission row at all
	enrol('ben@x', 'B Ben'), // finished after the due time, no row
	enrol('cruz@x', 'C Cruz'), // half done, no row: still Missing
	enrol('dee@x', 'D Dee'), // finished and graded, not returned (a draft row with graded_at)
	enrol('eli@x', 'E Eli'), // finished, then closed by the teacher (submitted, no submitted_at)
	enrol('fay@x', 'F Fay'), // finished and returned
	enrol('gus@x', 'G Gus'), // wrote the half Cruz did not: a classmate's answer finishes nobody
	enrol('hana@x', 'H Hana'), // a draft row (a photo attached elsewhere) and one answer: not finished
	enrol('pina@x', 'Mr. Pina') // manages: never a row
];
ROSTER[8] = { ...ROSTER[8], manages: true };

const answer = (email: string, block: string, minutesAgo: number): ResponseRow => ({
	item_id: ITEM_ID,
	student_email: email,
	block_id: block,
	value: { text: 'The driver has 12 teeth and the driven gear has 36.' },
	updated_at: ago(minutesAgo)
});

const sub = (email: string, over: Partial<SubmissionRow>): SubmissionRow =>
	({
		id: `sub-${email}`,
		item_id: ITEM_ID,
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

const GRADING: GradingData = {
	roster: ROSTER,
	submissions: [
		sub('dee@x', { graded_at: ago(10), graded_by: 'pina@x', score: 4 }),
		sub('eli@x', { state: 'submitted', submitted_at: null }),
		sub('fay@x', { state: 'returned', returned_at: ago(5), graded_at: ago(5), score: 4 }),
		sub('hana@x', {})
	],
	responses: [
		answer('ana@x', 'm1-ratio', 180),
		answer('ana@x', 'm2-why', 120), // both before the due time (60 minutes ago)
		answer('ben@x', 'm1-ratio', 180),
		answer('ben@x', 'm2-why', 30), // the last one after it
		answer('cruz@x', 'm1-ratio', 100),
		answer('dee@x', 'm1-ratio', 200),
		answer('dee@x', 'm2-why', 190),
		answer('eli@x', 'm1-ratio', 200),
		answer('eli@x', 'm2-why', 190),
		answer('fay@x', 'm1-ratio', 200),
		answer('fay@x', 'm2-why', 190),
		answer('gus@x', 'm2-why', 100),
		answer('hana@x', 'm1-ratio', 100)
	],
	files: [],
	approvals: []
};

function grid(grading: LiveGradingData | null) {
	return liveCells({
		item: ITEM,
		signal: true,
		grading,
		roster: ROSTER,
		presence: null,
		presenceStatus: 'ready',
		now: NOW
	}).map((c) => [c.email, c.state, c.detail, c.missing]);
}

describe('with the manifest: a finished worksheet is handed in, in the student chip\'s own words', () => {
	it('reads every student the way their class page does', () => {
		expect(grid({ ...GRADING, worksheet: MANIFEST })).toEqual([
			['ana@x', 'needs-grading', 'Complete', false],
			['ben@x', 'needs-grading', 'Complete, late', false],
			['cruz@x', 'away', 'Draft saved', true],
			['dee@x', 'submitted', 'Graded', false],
			['eli@x', 'submitted', 'Closed', false],
			['fay@x', 'submitted', 'Returned', false],
			['gus@x', 'away', 'Draft saved', true],
			['hana@x', 'away', 'Draft saved', true]
		]);
	});
});

describe('without the manifest: exactly the grid it was', () => {
	const before = [
		['ana@x', 'away', 'Draft saved', true],
		['ben@x', 'away', 'Draft saved', true],
		['cruz@x', 'away', 'Draft saved', true],
		['dee@x', 'away', 'Draft saved', true],
		['eli@x', 'submitted', 'Closed', false],
		['fay@x', 'submitted', 'Returned', false],
		['gus@x', 'away', 'Draft saved', true],
		['hana@x', 'away', 'Draft saved', true]
	];
	it('a spec assignment (no worksheet key at all)', () => {
		expect(grid(GRADING)).toEqual(before);
	});
	it('a manifest read that answered null', () => {
		expect(grid({ ...GRADING, worksheet: null })).toEqual(before);
	});
});

describe('the grading read with the manifest beside it', () => {
	const load = async (): Promise<{ ok: true; data: GradingData }> => ({ ok: true, data: GRADING });

	it('carries the manifest the read answered', async () => {
		const res = await withWorksheetManifest(load, async () => MANIFEST)('i-gears', 's-1');
		expect(res.ok && res.data.worksheet).toBe(MANIFEST);
		expect(res.ok && res.data.responses).toBe(GRADING.responses);
	});

	it('a manifest read that rejects, throws or answers null is the grid without one, never a failure', async () => {
		for (const read of [
			async () => {
				throw new Error('network');
			},
			() => {
				throw new Error('sync');
			},
			async () => null
		] as ((id: string) => Promise<HtmlAssignmentManifest | null>)[]) {
			const res = await withWorksheetManifest(load, read)('i-gears', 's-1');
			expect(res).toEqual({ ok: true, data: { ...GRADING, worksheet: null } });
		}
	});

	it('a failed grading read is reported as it was, whatever the manifest', async () => {
		const failed = async () => ({ ok: false as const, message: 'Could not load.' });
		expect(await withWorksheetManifest(failed, async () => MANIFEST)('i-gears', 's-1')).toEqual({
			ok: false,
			message: 'Could not load.'
		});
	});
});

describe('the manifest read the live page makes is pinned to the item and reads no answers', () => {
	/** A client that records every table read and its filters, answering like PostgREST would. */
	function recording(version: unknown = 3) {
		const calls: { table: string; select: string; filters: [string, string, unknown][] }[] = [];
		const client = {
			from(table: string) {
				const call = { table, select: '', filters: [] as [string, string, unknown][] };
				calls.push(call);
				const data =
					table === 'classroom_items'
						? [{ id: ITEM_ID, assignment_schema_version: version }]
						: table === 'classroom_html_assignments'
							? [{ item_id: ITEM_ID, manifest: MANIFEST }]
							: [];
				const builder = {
					select(s: string) {
						call.select = s;
						return builder;
					},
					in(col: string, v: unknown) {
						call.filters.push(['in', col, v]);
						return builder;
					},
					eq(col: string, v: unknown) {
						call.filters.push(['eq', col, v]);
						return builder;
					},
					then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
						return Promise.resolve({ data, error: null }).then(ok, bad);
					}
				};
				return builder;
			}
		};
		return { client: client as unknown as SupabaseClient, calls };
	}

	it('two reads, each filtered to the one item id, neither of them an answers read', async () => {
		const { client, calls } = recording();
		const map = await readWorksheetManifests(client, [ITEM_ID]);
		expect(map?.get(ITEM_ID)).toEqual(MANIFEST);
		expect(calls.map((c) => c.table).sort()).toEqual(['classroom_html_assignments', 'classroom_items']);
		for (const c of calls) expect(c.filters).toEqual([['in', c.table === 'classroom_items' ? 'id' : 'item_id', [ITEM_ID]]]);
		expect(calls.some((c) => c.table === 'classroom_responses' || c.table === 'classroom_submission_files')).toBe(false);
	});

	it('an item the discriminator does not stamp is not a worksheet, whatever its manifest row says', async () => {
		for (const version of [1, null, '3']) {
			const { client } = recording(version);
			const map = await readWorksheetManifests(client, [ITEM_ID]);
			expect(map?.size, String(version)).toBe(0);
		}
	});

	it('a read that errors is "cannot tell" (null), never an empty answer that would look like "not a worksheet"', async () => {
		const failing = {
			from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) })
		} as unknown as SupabaseClient;
		expect(await readWorksheetManifests(failing, [ITEM_ID])).toBeNull();
		const throwing = {
			from: () => {
				throw new Error('boom');
			}
		} as unknown as SupabaseClient;
		expect(await readWorksheetManifests(throwing, [ITEM_ID])).toBeNull();
	});
});
