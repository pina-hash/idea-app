// tests/classroom-grading-across-sections-parallel.test.ts
//
// THE GRADING SURFACE'S WORK READ IS ISSUED IN THE SAME WAVE AS ITS ROSTER,
// NOT AFTER IT.
//
// WHAT WAS WRONG (ledger 0107's loading audit; excluded from 0108 only because
// another lane held `transports.ts` at the time). `loadGradingAcrossSections`
// opened with a `Promise.all` of the roster RPC and the item's postings, and
// then, on the line after, awaited `loadItemWork` -- which itself fans out into
// four more reads. `loadItemWork(supabase, itemId)` takes the item id and
// NOTHING ELSE: not the roster, not the postings, not the intersection between
// them. So the second wave was waiting on a first wave it does not read, and
// every open of the across-sections console paid a round trip for the ordering.
//
// WHY IT NEEDS A TEST AT ALL, given that it is one line. A serialized read is
// INVISIBLE in every other instrument: the payload is byte-identical either
// way, nothing errors, no count moves, and the only symptom is that the console
// takes longer to appear on a school connection. Re-serializing it later --
// hoisting a `const` out of the array, adding an `await` above it -- would
// restore the defect with nothing anywhere to notice. That is the definition of
// a regression worth a test in this repo.
//
// HOW IT IS MEASURED, and it is not a clock. A wall-clock comparison of two
// runs is a flake generator and proves nothing about ordering. This drives the
// REAL exported transport against a recording client that GATES the roster RPC:
// the roster cannot resolve until the test releases it, so "was the work read
// issued" is a question about the ordering itself and has one answer. A
// PostgREST builder does not send anything until it is awaited, so the issue
// point recorded here is `then`, which is where supabase-js sends the request.
//
// THE POSITIVE CONTROL is the postings read: it was always in the first wave,
// so its presence in the log proves the log is recording rather than that
// nothing ran. And the payload is asserted afterwards, because a read moved
// into a wave still has to answer the same thing.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBulkGradingTransports } from '../src/lib/classroom/transports';

const ITEM = 'i-unit1-final';

const SECTION = {
	id: 's1',
	course_id: 'c1',
	label: 'Block 4',
	block: '4',
	teacher_email: 'wcosso@boscotech.edu',
	active: true,
	classroom_courses: { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

const SUBMISSION = {
	id: 'sub-1',
	item_id: ITEM,
	student_email: 'student@boscotech.net',
	state: 'submitted',
	submitted_at: '2026-09-08T17:00:00Z',
	returned_at: null,
	rubric_scores: null,
	criterion_comments: null,
	score: null,
	teacher_comment: null,
	graded_by: null,
	graded_at: null,
	extra_credit: null,
	updated_at: '2026-09-08T17:00:00Z'
};

/** What each table answers. Anything not named here comes back empty. */
const ROWS: Record<string, unknown[]> = {
	classroom_postings: [{ section_id: 's1', classroom_sections: SECTION }],
	classroom_submissions: [SUBMISSION],
	classroom_responses: [],
	classroom_submission_files: [],
	classroom_module_approvals: []
};

interface Recorder {
	client: SupabaseClient;
	/** Table names and rpc names, in the order they were actually SENT. */
	issued: string[];
	releaseRoster: () => void;
}

/**
 * A client that records when each read is SENT and holds the roster RPC open.
 *
 * It is deliberately not the PostgREST shim: the shim answers a real database
 * and resolves whenever it resolves, which is the one thing this file cannot
 * let it decide. Everything under test here is ordering.
 */
function recordingClient(): Recorder {
	const issued: string[] = [];
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));

	const builder = (table: string) => {
		const self: Record<string, unknown> = {};
		for (const method of ['select', 'eq', 'order', 'in', 'limit']) {
			self[method] = () => self;
		}
		self.then = (
			resolve: (v: { data: unknown[]; error: null }) => unknown
		) => {
			issued.push(table);
			return Promise.resolve({ data: ROWS[table] ?? [], error: null }).then(resolve);
		};
		return self;
	};

	const client = {
		rpc: async (name: string) => {
			issued.push(`rpc:${name}`);
			// THE GATE. Nothing downstream of the roster may depend on it, and
			// this is what makes that assertable rather than asserted.
			await gate;
			return { data: [{ section_id: 's1', email: 'student@boscotech.net', manages: false }], error: null };
		},
		from: (table: string) => builder(table)
	};

	return { client: client as unknown as SupabaseClient, issued, releaseRoster: release };
}

/** Let every already-scheduled microtask and macrotask run, then look. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the across-sections grading load issues its reads in one wave', () => {
	it('sends the work reads while the roster RPC is still open', async () => {
		const rec = recordingClient();
		const pending = createBulkGradingTransports(rec.client).loadAcross(ITEM);

		await settle();

		// THE ROSTER HAS NOT ANSWERED. Everything below is therefore about what
		// was sent WITHOUT waiting for it.
		expect(rec.issued).toContain('rpc:classroom_section_roster');
		// The positive control: a read that was always in the first wave.
		expect(rec.issued).toContain('classroom_postings');
		// THE FOUR READS `loadItemWork` FANS OUT INTO. Pre-fix not one of these
		// has been sent at this point, because the call sat behind an `await` on
		// the roster it does not read.
		expect(rec.issued).toContain('classroom_submissions');
		expect(rec.issued).toContain('classroom_responses');
		expect(rec.issued).toContain('classroom_submission_files');
		expect(rec.issued).toContain('classroom_module_approvals');

		rec.releaseRoster();
		const res = await pending;

		// AND THE PAYLOAD IS UNCHANGED, which is the other half: a read moved
		// into a wave still has to answer the same question.
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error('unreachable');
		expect(res.data.sections.map((s) => s.id)).toEqual(['s1']);
		expect(res.data.data.roster.map((r) => r.section_id)).toEqual(['s1']);
		expect(res.data.data.submissions.map((s) => s.id)).toEqual(['sub-1']);
		// The ladder rungs still report themselves: both widest rungs answered
		// here, so a payload that silently degraded would be visible.
		expect(res.data.data.extraCreditReady).toBe(true);
		expect(res.data.data.filesStorageReady).toBe(true);
	});
});
