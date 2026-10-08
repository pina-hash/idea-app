/**
 * Sample rows for the Armory tabs of `/dev/feedback` (dev only, never shipped:
 * the page that imports it 404s in production).
 *
 * Shaped like `armory_app_feedback_admin_list` and
 * `armory_app_incidents_admin_list` answer (CONTRACT part 10), and chosen to
 * put every branch of the two consoles on screen at once: two app versions
 * times three kinds of note, a note whose body is hostile markup and one whose
 * context holds runs of backticks, incidents across three school days, the
 * seven known incident kinds plus one the site has never heard of, an incident
 * with no project, and one linked to the note its reporter sent with it.
 *
 * Times are relative to when the page loaded, so the per-day table always has
 * something in its first three rows.
 */
import type { ArmoryFeedbackRow, ArmoryIncidentRow } from '$lib/feedback/armory-reports';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function armorySampleNotes(now: number): ArmoryFeedbackRow[] {
	const at = (ms: number) => new Date(now - ms).toISOString();
	const base = {
		email: 'harness.student@boscotech.net',
		device_name: 'LAB-PC-07',
		status: 'new' as const,
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Harness Student'
	};
	return [
		{
			...base,
			id: 'armory-note-1',
			created_at: at(1 * HOUR),
			app_version: '0.3.0',
			kind: 'bug',
			body: 'Checking in a part froze the window for about ten seconds, then it came back.',
			context: { screen: 'files', project: 'Robot 2027', lastAction: 'check in', durationMs: 10234 },
			// 0235's three fields, so the console's rendering of them is in the harness.
			area: 'Files',
			tried: 'Closed SOLIDWORKS first, then tried again. Same freeze.',
			screenshot_path: '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png'
		},
		{
			...base,
			id: 'armory-note-2',
			created_at: at(3 * HOUR),
			app_version: '0.3.0',
			kind: 'idea',
			body: 'Could the file list remember which folder I had open?',
			context: { screen: 'files' }
		},
		{
			...base,
			id: 'armory-note-3',
			created_at: at(1 * DAY + 2 * HOUR),
			app_version: '0.2.4',
			kind: 'other',
			email: 'harness.mentor@boscotech.edu',
			submitter_name: 'Harness Mentor',
			device_name: 'SHOP-LAPTOP',
			body: 'The log below has backticks in it.',
			context: {
				log: 'step 1 ``` fenced? no\nstep 2 ```` still not\nstep 3 done',
				nested: { values: [1, 2, 3], flag: true }
			}
		},
		{
			...base,
			id: 'armory-note-4',
			created_at: at(1 * DAY + 5 * HOUR),
			app_version: '0.2.4',
			kind: 'bug',
			body: '<script>alert(1)</script><img src=x onerror=alert(1)> ### not a heading',
			context: { '<b>key</b>': '<script>alert(2)</script>' },
			device_name: '<b>PC</b>'
		},
		{
			...base,
			id: 'armory-note-5',
			created_at: at(2 * DAY + 1 * HOUR),
			app_version: '0.3.0',
			kind: 'other',
			status: 'seen',
			reviewed_at: at(2 * DAY),
			reviewed_by: 'harness-admin@boscotech.edu',
			body: 'Thanks, the sync is much faster now.',
			context: {}
		},
		{
			...base,
			id: 'armory-note-6',
			created_at: at(2 * DAY + 4 * HOUR),
			app_version: '0.2.4',
			kind: 'idea',
			device_name: null,
			body: 'A dark mode for the tray menu.',
			context: { screen: 'tray' }
		}
	];
}

export function armorySampleIncidents(now: number): ArmoryIncidentRow[] {
	const at = (ms: number) => new Date(now - ms).toISOString();
	const base = {
		email: 'harness.student@boscotech.net',
		device_name: 'LAB-PC-07',
		project_id: 'p-robot',
		project_name: 'Robot 2027',
		feedback_id: null,
		feedback_body: null,
		status: 'new' as const,
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Harness Student'
	};
	return [
		{ ...base, id: 'aaaaaaaa-0000-4000-8000-000000000001', created_at: at(1 * HOUR), app_version: '0.3.0', kind: 'crash', summary: 'The app closed while uploading a part.', report_bytes: 48_211, feedback_id: 'armory-note-1', feedback_body: 'Checking in a part froze the window for about ten seconds, then it came back.' },
		{ ...base, id: 'aaaaaaaa-0000-4000-8000-000000000002', created_at: at(2 * HOUR), app_version: '0.3.0', kind: 'crash', summary: 'The app closed on start.', report_bytes: 51_002 },
		{ ...base, id: 'bbbbbbbb-0000-4000-8000-000000000003', created_at: at(3 * HOUR), app_version: '0.3.0', kind: 'slowAction', summary: 'Opening the file list took 9.8 seconds.', report_bytes: 2_210 },
		{ ...base, id: 'cccccccc-0000-4000-8000-000000000004', created_at: at(1 * DAY + 1 * HOUR), app_version: '0.2.4', kind: 'slowPass', summary: 'One sync pass took 4 minutes.', report_bytes: 9_870, project_id: null, project_name: null },
		{ ...base, id: 'dddddddd-0000-4000-8000-000000000005', created_at: at(1 * DAY + 3 * HOUR), app_version: '0.2.4', kind: 'repeatedFailure', summary: 'Checking out the same file failed five times.', report_bytes: 3_300, email: 'harness.mentor@boscotech.edu', submitter_name: 'Harness Mentor', device_name: 'SHOP-LAPTOP', project_id: 'p-sumo', project_name: 'Sumo bot' },
		{ ...base, id: 'eeeeeeee-0000-4000-8000-000000000006', created_at: at(2 * DAY + 2 * HOUR), app_version: '0.2.4', kind: 'repairedCheckout', summary: 'A checkout left behind by a crash was repaired.', report_bytes: 1_024 },
		{ ...base, id: 'ffffffff-0000-4000-8000-000000000007', created_at: at(2 * DAY + 3 * HOUR), app_version: '0.3.0', kind: 'readOnlyBroken', summary: 'A file that should be read-only could be edited.', report_bytes: 812 },
		{ ...base, id: '11111111-0000-4000-8000-000000000008', created_at: at(2 * DAY + 4 * HOUR), app_version: '0.3.0', kind: 'userReport', summary: '<b>bold?</b> The user pressed Report from the tray.', report_bytes: 640 },
		{ ...base, id: '22222222-0000-4000-8000-000000000009', created_at: at(2 * DAY + 5 * HOUR), app_version: '0.3.1-beta', kind: 'diskFull', summary: 'A kind this site has never heard of.', report_bytes: 300 }
	];
}

/** The full reports, keyed by id; one id is left out on purpose, as a report that could not be read. */
export function armorySampleReports(incidents: ArmoryIncidentRow[]): Map<string, unknown> {
	const out = new Map<string, unknown>();
	for (const row of incidents) {
		if (row.kind === 'readOnlyBroken') continue;
		out.set(row.id, {
			kind: row.kind,
			appVersion: row.app_version,
			stack: ['at Sync.run (sync.ts:120)', 'at main (app.ts:9)'],
			note: 'harness report ``` with a fence in it'
		});
	}
	return out;
}
