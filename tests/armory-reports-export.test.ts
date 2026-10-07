// tests/armory-reports-export.test.ts
//
// THE ARMORY APP'S NOTES AND INCIDENTS, the pure half (website requests v0.3,
// items 4 and 4b). What would fail SILENTLY:
//
//   1. A CONTEXT HOLDING BACKTICKS CLOSES ITS FENCE EARLY and turns the rest of
//      the exported file into somebody's JSON. The fence must outgrow it.
//   2. A NOTE OPENING WITH `###` BECOMES A HEADING and reparents the notes after
//      it. It goes through the site queue's own quoting.
//   3. THE FILE NAME IS THE SCHOOL'S DAY, not the browser's, at the evening
//      instant where Los Angeles and UTC disagree.
//   4. AN INCIDENT FILE CARRIES ITS REPORT VERBATIM, and the identity toggle
//      really removes the address and the name.
//   5. THE ZIP HOLDS ONE FILE PER INCIDENT, names never collide, and what the
//      budget or a failed read left out comes back to be said.

import { describe, expect, it } from 'vitest';
import {
	ARMORY_INCIDENT_FORMAT,
	ARMORY_NO_PROJECT,
	EMPTY_ARMORY_INCIDENT_FILTER,
	armoryExportDay,
	armoryFeedbackExportName,
	armoryFeedbackMarkdown,
	armoryReportsNotReady,
	buildIncidentZip,
	feedbackSourceFor,
	fenceFor,
	filterArmoryIncidents,
	groupIncidents,
	incidentCountsByDay,
	incidentFileJson,
	incidentFileName,
	incidentKindWord,
	parseArmoryFeedbackRows,
	parseArmoryIncidentRows,
	type ArmoryFeedbackRow,
	type ArmoryIncidentRow
} from '../src/lib/feedback/armory-reports';
import { inflateEntry, readCentralDirectory } from '../src/lib/foundry/zip';

/** The real reader the Foundry upload path uses, over every file record. */
async function readZip(bytes: Uint8Array): Promise<{ path: string; bytes: Uint8Array }[]> {
	const records = readCentralDirectory(bytes);
	expect(records, 'the zip is not readable').not.toBeNull();
	const out: { path: string; bytes: Uint8Array }[] = [];
	for (const record of records!) {
		if (record.directory) continue;
		out.push({ path: record.name, bytes: await inflateEntry(bytes, record, record.name) });
	}
	return out;
}

function note(over: Partial<ArmoryFeedbackRow> = {}): ArmoryFeedbackRow {
	return {
		id: 'n1',
		created_at: '2026-10-07T17:00:00.000Z',
		email: 'stu@boscotech.net',
		device_name: 'LAB-PC-07',
		app_version: '0.3.0',
		kind: 'bug',
		body: 'It froze when I checked in.',
		context: { screen: 'files' },
		status: 'new',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Stu Dent',
		...over
	};
}

function incident(over: Partial<ArmoryIncidentRow> = {}): ArmoryIncidentRow {
	return {
		id: 'aaaaaaaa-0000-4000-8000-000000000001',
		created_at: '2026-10-07T17:00:00.000Z',
		email: 'stu@boscotech.net',
		device_name: 'LAB-PC-07',
		app_version: '0.3.0',
		kind: 'crash',
		summary: 'The app closed.',
		project_id: 'p1',
		project_name: 'Robot 2027',
		feedback_id: null,
		feedback_body: null,
		report_bytes: 100,
		status: 'new',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Stu Dent',
		...over
	};
}

describe('the notes as one Markdown file', () => {
	it('fenceFor outgrows every backtick run inside, never under three', () => {
		expect(fenceFor('{}')).toBe('```');
		expect(fenceFor('a ``` b')).toBe('````');
		expect(fenceFor('a ```` b ``` c')).toBe('`````');
	});

	it('a context holding ``` and ```` stays one fenced block per note', () => {
		const md = armoryFeedbackMarkdown([
			note({ id: 'a', context: { log: 'line ``` and ```` here' } }),
			note({ id: 'b', context: {} })
		]);
		const fences = md.split('\n').filter((l) => /^`{3,}/.test(l));
		// Two notes, one block each: an opening line carrying `json` and a bare
		// closing line, the same length.
		expect(fences).toEqual(['`````json', '`````', '```json', '```']);
		expect(md).toContain('"log": "line ``` and ```` here"');
	});

	it('a body opening with ### is quoted, never a heading; the date, who, version and kind are there', () => {
		const md = armoryFeedbackMarkdown([note({ body: '### promoted?\nsecond line' })], {
			generatedAt: '2026-10-07T18:00:00.000Z'
		});
		expect(md).toContain('> \\### promoted?');
		expect(md).not.toMatch(/^### promoted/m);
		expect(md).toContain('- date: 2026-10-07T17:00:00.000Z');
		expect(md).toContain('- who: Stu Dent (stu@boscotech.net)');
		expect(md).toContain('- version: 0.3.0');
		expect(md).toContain('- kind: bug');
		expect(md).toContain('Submitter identity: included.');
	});

	it('withholding names removes the who line and says so', () => {
		const md = armoryFeedbackMarkdown([note()], { includeSubmitter: false });
		expect(md).not.toContain('stu@boscotech.net');
		expect(md).not.toContain('Stu Dent');
		expect(md).toContain('Submitter identity: withheld at export.');
	});

	it('the file is named for the school day, at the instant LA and UTC disagree', () => {
		// 8pm Pacific on the 27th is already the 28th in UTC.
		const at = Date.parse('2026-08-28T03:00:00Z');
		expect(new Date(at).toISOString().slice(0, 10)).toBe('2026-08-28');
		expect(armoryFeedbackExportName(armoryExportDay(at))).toBe('armory-feedback-2026-08-27.md');
	});
});

describe('one incident as one JSON file', () => {
	const report = { stack: ['a', 'b'], nested: { deep: [1, 2, { x: null }] }, text: 'é ``` <script>' };

	it('carries the report verbatim under `report`, with the row\'s fields', () => {
		const parsed = JSON.parse(incidentFileJson(incident(), report));
		expect(parsed.format).toBe(ARMORY_INCIDENT_FORMAT);
		expect(parsed.report).toEqual(report);
		expect(parsed).toMatchObject({
			id: incident().id,
			kind: 'crash',
			summary: 'The app closed.',
			app_version: '0.3.0',
			device_name: 'LAB-PC-07',
			email: 'stu@boscotech.net',
			submitter_name: 'Stu Dent',
			project_id: 'p1',
			project_name: 'Robot 2027',
			submitter_identity: 'included'
		});
	});

	it('the identity toggle removes the address and the name, and says it did', () => {
		const parsed = JSON.parse(incidentFileJson(incident(), report, { includeSubmitter: false }));
		expect(Object.hasOwn(parsed, 'email')).toBe(false);
		expect(Object.hasOwn(parsed, 'submitter_name')).toBe(false);
		expect(parsed.submitter_identity).toBe('withheld');
		expect(JSON.stringify(parsed)).not.toContain('stu@boscotech.net');
		expect(parsed.report).toEqual(report);
	});

	it('is named for the school day, the kind and the first eight of the id', () => {
		expect(incidentFileName(incident({ created_at: '2026-08-28T03:00:00Z' }))).toBe(
			'armory-incident-2026-08-27-crash-aaaaaaaa.json'
		);
	});
});

describe('the zip', () => {
	const rows = [
		incident({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
		// The same day, kind and first eight: the name must still be unique.
		incident({ id: 'aaaaaaaa-0000-4000-8000-000000000002' }),
		incident({ id: 'bbbbbbbb-0000-4000-8000-000000000003', kind: 'slowPass' }),
		incident({ id: 'cccccccc-0000-4000-8000-000000000004' })
	];
	const reports = new Map<string, unknown>([
		[rows[0].id, { n: 1 }],
		[rows[1].id, { n: 2 }],
		[rows[2].id, { n: 3 }]
		// rows[3] was not read
	]);

	it('one entry per incident that was read, unique names, every report verbatim', async () => {
		const zip = await buildIncidentZip(rows, reports, { day: '2026-10-07' });
		expect(zip.name).toBe('armory-incidents-2026-10-07.zip');
		expect(zip.included).toBe(3);
		expect(zip.notRead).toEqual([rows[3].id]);
		expect(zip.overBudget).toEqual([]);
		const files = await readZip(zip.bytes);
		const names = files.map((f) => f.path).sort();
		expect(names).toEqual(
			[
				'armory-incidents-2026-10-07/armory-incident-2026-10-07-crash-aaaaaaaa.json',
				'armory-incidents-2026-10-07/armory-incident-2026-10-07-crash-aaaaaaaa-2.json',
				'armory-incidents-2026-10-07/armory-incident-2026-10-07-slowPass-bbbbbbbb.json'
			].sort()
		);
		const decoded = files.map((f) => JSON.parse(new TextDecoder().decode(f.bytes)).report);
		expect(decoded).toEqual(expect.arrayContaining([{ n: 1 }, { n: 2 }, { n: 3 }]));
	});

	it('stops at the budget and names what it cut, keeping at least one file', async () => {
		const zip = await buildIncidentZip(rows.slice(0, 3), reports, { day: '2026-10-07', budget: 10 });
		expect(zip.included).toBe(1);
		expect(zip.overBudget).toEqual([rows[1].id, rows[2].id]);
	});
});

describe('grouping, the per-day counts and the filters', () => {
	const rows = [
		incident({ id: '1', kind: 'crash', app_version: '0.3.0', created_at: '2026-10-07T17:00:00Z' }),
		incident({ id: '2', kind: 'crash', app_version: '0.3.0', created_at: '2026-10-05T17:00:00Z' }),
		incident({ id: '3', kind: 'slowPass', app_version: '0.3.1', created_at: '2026-10-06T17:00:00Z', project_id: null, project_name: null }),
		incident({ id: '4', kind: 'brandNewKind', app_version: '0.3.0', created_at: '2026-10-08T03:00:00Z', email: 'b@boscotech.net' })
	];

	it('groups by kind and version, newest group first, newest first inside', () => {
		const groups = groupIncidents(rows);
		expect(groups.map((g) => [g.kind, g.version, g.rows.map((r) => r.id)])).toEqual([
			['brandNewKind', '0.3.0', ['4']],
			['crash', '0.3.0', ['1', '2']],
			['slowPass', '0.3.1', ['3']]
		]);
	});

	it('an unknown kind is shown as sent; a known one gets its words', () => {
		expect(incidentKindWord('brandNewKind')).toBe('brandNewKind');
		expect(incidentKindWord('slowPass')).toBe('Slow sync pass');
		expect(incidentKindWord('constructor')).toBe('constructor');
	});

	it('counts by the LA school day, fourteen days, newest first, zeros included', () => {
		const days = incidentCountsByDay(rows, '2026-10-07');
		expect(days).toHaveLength(14);
		expect(days[0]).toEqual({ day: '2026-10-07', count: 2 }); // 17:00Z and 03:00Z on the 8th, both the 7th in LA
		expect(days[1]).toEqual({ day: '2026-10-06', count: 1 });
		expect(days[2]).toEqual({ day: '2026-10-05', count: 1 });
		expect(days[3]).toEqual({ day: '2026-10-04', count: 0 });
		expect(days.reduce((n, d) => n + d.count, 0)).toBe(4);
	});

	it('the person and project filters narrow, "no project" included, both directions', () => {
		const f = EMPTY_ARMORY_INCIDENT_FILTER;
		expect(filterArmoryIncidents(rows, f).map((r) => r.id)).toEqual(['1', '2', '3', '4']);
		expect(filterArmoryIncidents(rows, { ...f, person: 'b@boscotech.net' }).map((r) => r.id)).toEqual(['4']);
		expect(filterArmoryIncidents(rows, { ...f, project: ARMORY_NO_PROJECT }).map((r) => r.id)).toEqual(['3']);
		expect(filterArmoryIncidents(rows, { ...f, project: 'p1' }).map((r) => r.id)).toEqual(['1', '2', '4']);
	});
});

describe('reading the list functions\' answers and the area\'s plumbing', () => {
	it('drops a row with no id, time or words rather than half-rendering it', () => {
		expect(parseArmoryFeedbackRows([note(), { id: 'x' }, null, 'junk', { ...note(), body: 3 }]).map((r) => r.id)).toEqual(['n1']);
		expect(parseArmoryIncidentRows([incident(), { id: 'x', created_at: 'now' }]).map((r) => r.id)).toEqual([incident().id]);
		expect(parseArmoryFeedbackRows(null)).toEqual([]);
		// An unknown status reads as new, never as a state no tab shows.
		expect(parseArmoryFeedbackRows([{ ...note(), status: 'archived' }])[0].status).toBe('new');
	});

	it('the list never asked for a report, and a row that carries one anyway does not keep it', () => {
		const parsed = parseArmoryIncidentRows([{ ...incident(), report: { secret: 1 } }]);
		expect(Object.hasOwn(parsed[0], 'report')).toBe(false);
		expect(parsed[0].report_bytes).toBe(100);
	});

	it('a missing function or relation is "not applied yet"; a timeout is not', () => {
		for (const code of ['PGRST202', '42883', '42P01', 'PGRST205']) expect(armoryReportsNotReady(code), code).toBe(true);
		for (const code of ['57014', '42501', '', null]) expect(armoryReportsNotReady(code), String(code)).toBe(false);
	});

	it('the source strip lights exactly one key per path', () => {
		expect(feedbackSourceFor('/admin/feedback')).toBe('site');
		expect(feedbackSourceFor('/admin/feedback/')).toBe('site');
		expect(feedbackSourceFor('/admin/feedback/armory')).toBe('armory');
		expect(feedbackSourceFor('/admin/feedback/incidents/')).toBe('incidents');
		expect(feedbackSourceFor('/dev/feedback')).toBe('site');
	});
});
