// tests/armory-v033-website.test.ts
//
// THE WEBSITE HALF OF ARMORY 0.3.3's FOUR REQUESTS (ledger 0377, migration
// 0236), where a regression would be silent:
//
//   - TWO COMPUTERS WITH ONE NAME READ AS ONE. A label that skipped a list, or
//     tagged a computer whose name nobody shares, reads as a plausible name.
//   - A FILE WITH NO FIRST VERSION IS CALLED "AVAILABLE", which is what it was
//     called until 0236 and what made 38 of them look like ordinary files.
//   - A CAD LEAD IS OFFERED THE INSTRUCTOR ROLE, which the server now refuses.
//   - A REFUSAL IS READ FROM THE HTTP STATUS instead of its SQLSTATE.
//   - A NOTE OR AN INCIDENT SHOWS A MACHINE ID THAT IS NOT ITS OWN.

import { describe, expect, test } from 'vitest';
import { addableRoles, deviceLabels, labelProjectDevices, ROLE_POWERS_WORDS } from '../src/lib/armory/team';
import {
	activityWords,
	fileState,
	hasNoFirstVersion,
	memberErrorWords,
	removeEmptyWords,
	STATE_WORDS,
	stateDetail,
	type ArmoryChange,
	type ArmoryCheckout,
	type ArmoryFile,
	type ArmoryMember
} from '../src/lib/armory/view';
import {
	deviceWithMachine,
	parseIncidentMachines,
	withIncidentMachines,
	withNoteMachines,
	type ArmoryFeedbackRow,
	type ArmoryIncidentRow
} from '../src/lib/feedback/armory-reports';

const NOW = Date.parse('2026-10-09T17:30:00Z');
const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
const A = 'a030c1d2-0000-4000-8000-000000000006';
const B = '7b41e9f0-0000-4000-8000-000000000006';
const C = 'c9990000-0000-4000-8000-000000000001';

const lockOn = (email: string, deviceId: string, device: string) => ({
	holder_email: email,
	holder_device_id: deviceId,
	holder_device_name: device,
	acquired_at: at(5),
	broken_at: null,
	broken_by: null
});
const file = (id: string, lock: ArmoryFile['lock'], current: ArmoryFile['current'] = null): ArmoryFile => ({
	id,
	folder: 'Drive',
	name: `${id}.SLDPRT`,
	deleted: false,
	created_at: at(60),
	current,
	lock
});
const saved = { id: 'v', hash: 'a'.repeat(64), bytes: 10, author: 'ana@x', created_at: at(30) };

describe('item 4: computers that share a name', () => {
	test('two computers named alike get the start of their ids; a name nobody shares stays as it is', () => {
		const labels = deviceLabels([
			{ id: A, name: 'IDEA-06' },
			{ id: B, name: ' idea-06 ' },
			{ id: C, name: 'Lab PC 3' },
			{ id: A, name: 'IDEA-06' }
		]);
		expect(Object.fromEntries(labels)).toEqual({ [A]: 'IDEA-06 (a030)', [B]: 'idea-06 (7b41)', [C]: 'Lab PC 3' });
		// Control: one computer listed twice is not two computers.
		expect(deviceLabels([{ id: A, name: 'IDEA-06' }, { id: A, name: 'IDEA-06' }]).get(A)).toBe('IDEA-06');
		expect(deviceLabels([{ id: A, name: '' }, { id: B, name: null }]).size).toBe(0);
	});

	test('the file rows, the checkout list and the team agree, across all three sources', () => {
		const files = [file('f1', lockOn('ana@x', A, 'IDEA-06')), file('f2', null, saved), file('f3', lockOn('cy@x', C, 'Lab PC 3'))];
		const checkouts: ArmoryCheckout[] = [
			{ file_id: 'f1', folder: 'Drive', name: 'f1.SLDPRT', holder_email: 'ana@x', holder_name: 'Ana', device_name: 'IDEA-06', since: at(5) },
			{ file_id: 'f3', folder: 'Drive', name: 'f3.SLDPRT', holder_email: 'cy@x', holder_name: null, device_name: 'Lab PC 3', since: at(5) }
		];
		// Ben's IDEA-06 holds nothing; only the team read knows it, and that is enough to make Ana's ambiguous.
		const members: ArmoryMember[] = [{ email: 'ben@x', role: 'student', devices: [{ id: B, name: 'IDEA-06', last_seen: at(1) }] }];
		const out = labelProjectDevices(files, checkouts, members);
		expect(out.files[0].lock?.holder_device_name).toBe('IDEA-06 (a030)');
		expect(out.files[1]).toBe(files[1]);
		expect(out.files[2]).toBe(files[2]);
		expect(out.checkouts.map((c) => c.device_name)).toEqual(['IDEA-06 (a030)', 'Lab PC 3']);
		expect(out.labels.get(B)).toBe('IDEA-06 (7b41)');
		// Nothing is mutated in place.
		expect(files[0].lock?.holder_device_name).toBe('IDEA-06');
		// Without Ben's computer, Ana's is the only IDEA-06 and keeps its plain name.
		expect(labelProjectDevices(files, checkouts, []).checkouts[0].device_name).toBe('IDEA-06');
	});
});

describe('item 2: a file with no first version', () => {
	test('it is its own state, never "Available", and says why', () => {
		const empty = file('e', null);
		expect(fileState(empty, NOW, new Map())).toBe('waiting');
		expect(hasNoFirstVersion(empty)).toBe(true);
		expect(STATE_WORDS.waiting.label).toBe('No first version');
		expect(STATE_WORDS.waiting.label).not.toBe(STATE_WORDS.synced.label);
		expect(stateDetail(empty, 'waiting', NOW)).toContain('without its first version');
		// Controls: a saved file is Available; an empty file someone is adding is checked out; a removed one is neither.
		expect(fileState(file('s', null, saved), NOW, new Map())).toBe('synced');
		expect(STATE_WORDS.synced.label).toBe('Available');
		expect(fileState(file('h', lockOn('ana@x', A, 'IDEA-06')), NOW, new Map())).toBe('editing');
		expect(hasNoFirstVersion({ ...empty, deleted: true })).toBe(false);
		expect(hasNoFirstVersion(file('s', null, saved))).toBe(false);
	});

	test('its refusals are read from the SQLSTATE, and the activity line names who removed it', () => {
		expect(removeEmptyWords('whatever', '55000')).toContain('has a first version now');
		expect(removeEmptyWords('whatever', '55006')).toContain('Force a check in first');
		expect(removeEmptyWords('whatever', '42501')).toContain('an instructor');
		expect(removeEmptyWords('whatever', 'P0002')).toContain('Reload');
		expect(removeEmptyWords('nothing changed')).toBe('It was already removed.');
		expect(removeEmptyWords('boom', '500')).toBe('That did not work. Try again in a minute.');
		const change = (payload: Record<string, unknown>): ArmoryChange => ({ cursor: 1, kind: 'tombstone', entity_id: 'f1', payload, created_at: at(1) });
		const names = new Map([['lea@x', 'Lea Diaz']]);
		expect(activityWords(change({ device_id: null, by: 'lea@x', reason: 'no_first_version' }), () => 'Arm.SLDPRT', false, names)).toBe(
			'Lea Diaz removed Arm.SLDPRT, which had no first version'
		);
		// Control: an ordinary removal reads as it always did.
		expect(activityWords(change({ device_id: 'd' }), () => 'Arm.SLDPRT')).toBe('Arm.SLDPRT was removed (history kept)');
	});
});

describe('items 1 and 3: who is offered what', () => {
	test('only a mentor is offered the instructor role; a CAD lead adds students', () => {
		expect(addableRoles('mentor')).toEqual(['student', 'instructor', 'cad_lead', 'mentor']);
		expect(addableRoles('cad_lead')).toEqual(['student']);
		expect(addableRoles('instructor')).toEqual([]);
		expect(addableRoles('student')).toEqual([]);
		expect(memberErrorWords('only a mentor may grant instructor', '42501')).toContain('an instructor');
		expect(memberErrorWords('only a mentor may change an instructor', '42501')).toContain('an instructor');
	});

	test('the role guide names every role once, and says what an instructor may do', () => {
		expect(ROLE_POWERS_WORDS.map((r) => r.role)).toEqual(['student', 'instructor', 'cad_lead', 'mentor']);
		const inst = ROLE_POWERS_WORDS.find((r) => r.role === 'instructor')!.words;
		for (const w of ['force a check in', 'no first version', 'checked out']) expect(inst).toContain(w);
		expect(ROLE_POWERS_WORDS.find((r) => r.role === 'student')!.words).not.toContain('force');
	});

	test('a move or a rename over someone else\'s checkout says so in the activity', () => {
		const names = new Map([['ana@x', 'Ana Reyes'], ['lea@x', 'Lea Diaz']]);
		const moved: ArmoryChange = {
			cursor: 2,
			kind: 'file_moved',
			entity_id: 'f1',
			payload: { old_name: 'Shaft.SLDPRT', folder: 'Arm', name: 'Shaft.SLDPRT', by: 'lea@x', checked_out_by: 'ana@x' },
			created_at: at(1)
		};
		expect(activityWords(moved, () => null, false, names)).toBe('Lea Diaz moved Shaft.SLDPRT to Arm/Shaft.SLDPRT while Ana Reyes had it checked out');
		const { checked_out_by: _, ...plain } = moved.payload!;
		expect(activityWords({ ...moved, payload: plain }, () => null, false, names)).toBe('Lea Diaz moved Shaft.SLDPRT to Arm/Shaft.SLDPRT');
		const renamed: ArmoryChange = { cursor: 3, kind: 'folder_renamed', entity_id: 'p', payload: { from: 'Arm', to: 'Arm v2', files: 3, by: 'lea@x', over_checkouts: 2 }, created_at: at(1) };
		expect(activityWords(renamed, () => null, false, names)).toBe('Lea Diaz renamed the folder Arm to Arm v2 (3 files), with 2 files checked out by others');
	});
});

describe('item 4: the machine id on the incident and feedback views', () => {
	const incident = (id: string, feedback: string | null): ArmoryIncidentRow => ({
		id,
		created_at: at(1),
		email: 'ana@x',
		device_name: 'IDEA-06',
		app_version: '0.3.3',
		kind: 'slowPass',
		summary: 's',
		project_id: null,
		project_name: null,
		feedback_id: feedback,
		feedback_body: null,
		report_bytes: 10,
		status: 'new',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: null
	});
	const note = (id: string, context: Record<string, unknown> | null = null): ArmoryFeedbackRow => ({
		id,
		created_at: at(1),
		email: 'ana@x',
		device_name: 'IDEA-06',
		app_version: '0.3.3',
		kind: 'bug',
		body: 'b',
		context,
		status: 'new',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: null
	});

	test('a read keeps only well-formed ids; each incident gets its own, and a note the one filed with it', () => {
		const machines = parseIncidentMachines([
			{ id: 'i1', feedback_id: 'n1', machine_id: '3f9c0a7e2b14d865' },
			{ id: 'i2', feedback_id: null, machine_id: 'a0300000000000ff' },
			{ id: 'i3', feedback_id: 'n3', machine_id: 'not a word' },
			{ id: 'i4', feedback_id: 'n4', machine_id: null },
			'junk'
		]);
		expect(machines.map((m) => m.id)).toEqual(['i1', 'i2']);
		const incidents = withIncidentMachines([incident('i1', 'n1'), incident('i2', null), incident('i9', null)], machines);
		expect(incidents.map((r) => r.machine_id ?? null)).toEqual(['3f9c0a7e2b14d865', 'a0300000000000ff', null]);
		const notes = withNoteMachines([note('n1'), note('n2'), note('n3', { machineId: 'beef00001111abcd' }), note('n4', { machineId: 'bad id!' })], machines);
		expect(notes.map((r) => r.machine_id ?? null)).toEqual(['3f9c0a7e2b14d865', null, 'beef00001111abcd', null]);
	});

	test('the device line says the name and the machine, or whichever is there', () => {
		expect(deviceWithMachine('IDEA-06', '3f9c0a7e2b14d865')).toBe('IDEA-06 (machine 3f9c0a7e2b14d865)');
		expect(deviceWithMachine('IDEA-06', null)).toBe('IDEA-06');
		expect(deviceWithMachine(null, 'abcd')).toBe('machine abcd');
		expect(deviceWithMachine('  ', undefined)).toBeNull();
	});
});
