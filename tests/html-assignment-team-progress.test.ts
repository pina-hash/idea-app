// tests/html-assignment-team-progress.test.ts
//
// TEAMMATES' PROGRESS INSIDE THE DOCUMENT (ledger 0422, gap 673cbfa2). The
// database answers which blocks each teammate has an answer under; this holds
// the conversion to the document's message: the same percent the rail's own
// rule gives, FIELDS (never block ids), each module's met count, and nothing
// of an answer's words, because none were sent.

import { describe, expect, it } from 'vitest';
import { teamProgressFor } from '../src/lib/classroom/html-assignment/team';
import { hxTeamProgressMessage, HX_TEAM_PROGRESS_TYPE } from '../src/lib/classroom/html-assignment/bridge';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';

function blade(): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Blade build',
		course: 'IDEA100',
		points: 4,
		header: [{ id: 'hb-name', field: 'studentName', type: 'text' }],
		modules: [
			{ id: 'day1', title: 'Day 1', points: 2, blocks: [{ id: 'd1-sketch', field: 'sketch', type: 'longText', minSentences: 3 }, { id: 'd1-photo', field: 'photo', type: 'image' }], criteria: [] },
			{ id: 'day2', title: 'Day 2', points: 2, blocks: [{ id: 'd2-check', field: 'checked', type: 'checkbox' }, { id: 'd2-notes', field: 'notes', type: 'text' }], criteria: [] }
		]
	} as HtmlAssignmentManifest;
}

describe('a team\'s progress, for the document', () => {
	const raw = {
		teams: [
			{
				team_name: 'Torque',
				members: [
					{ name: 'Ana Reyes', me: true, state: 'draft', answered: [], images: [] },
					{ name: 'Ben Ortiz', me: false, state: 'submitted', answered: ['d1-sketch', 'd2-check', 'gone-block'], images: ['d1-photo'] }
				]
			}
		]
	};

	it('gives each teammate a percent, the done FIELDS and each day\'s met count', () => {
		const t = teamProgressFor(blade(), raw)!;
		expect(t.team).toBe('Torque');
		const ana = t.members[0];
		const ben = t.members[1];
		expect(ana).toMatchObject({ name: 'Ana Reyes', me: true, handedIn: false, percent: 0, done: [] });
		expect(ben.handedIn).toBe(true);
		expect(ben.done).toEqual(['sketch', 'photo', 'checked']);
		expect(ben.modules).toEqual([
			{ id: 'day1', title: 'Day 1', met: 2, of: 2 },
			{ id: 'day2', title: 'Day 2', met: 1, of: 2 }
		]);
		expect(ben.percent).toBe(75);
		// A block the manifest no longer has is not counted, and no block id leaks.
		expect(JSON.stringify(t)).not.toMatch(/d1-sketch|gone-block/);
	});

	it('no team draw is no message', () => {
		expect(teamProgressFor(blade(), { teams: [] })).toBeNull();
		expect(teamProgressFor(blade(), null)).toBeNull();
	});

	it('the bridge message is plain data under its own type', () => {
		const m = hxTeamProgressMessage(teamProgressFor(blade(), raw)!);
		expect(m.type).toBe(HX_TEAM_PROGRESS_TYPE);
		expect(structuredClone(m)).toEqual(m);
	});
});
