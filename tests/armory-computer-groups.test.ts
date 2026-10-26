// tests/armory-computer-groups.test.ts
//
// LEDGER 0441: one lab computer, one line on the website. The Team view, the
// Files and Checked out labels and `presenceDevices` group devices by the
// server's per-computer token (0310) when a device carries one, and by name
// only when it does not. Pure functions over the shapes `armory_team_status`
// answers, so every case is a fixture rather than a screenshot.

import { describe, expect, test } from 'vitest';
import { computerGroups, computerKey, deviceLabels, labelProjectDevices, presenceDevices, teamComputers } from '../src/lib/armory/team';
import { checkoutsFromFiles, type ArmoryFile, type ArmoryMember, type ArmoryTeamDevice } from '../src/lib/armory/view';

const NOW = Date.parse('2026-10-26T17:30:00Z');
const ago = (minutes: number | null) => (minutes === null ? null : new Date(NOW - minutes * 60_000).toISOString());
const LAB = '3fa1c0de9b7e';
const CLONE = 'b2c4e6f8a012';
const device = (id: string, name: string, minutes: number | null, computer?: string | null): ArmoryTeamDevice => ({
	id,
	name,
	registered_at: ago(60 * 24 * 10),
	last_seen: ago(minutes),
	app_version: '0.5.1',
	state: 'idle',
	...(computer === undefined ? {} : { computer })
});
const member = (email: string, devices: ArmoryTeamDevice[]): ArmoryMember => ({ email, role: 'student', name: email.split('@')[0], devices, checkouts: [] });
const lockOn = (who: string, id: string, name: string) => ({
	holder_email: who,
	holder_device_id: id,
	holder_device_name: name,
	acquired_at: ago(10)!,
	broken_at: null,
	broken_by: null
});
const file = (id: string, lock: ReturnType<typeof lockOn> | null): ArmoryFile => ({ id, folder: 'Drive', name: `${id}.SLDPRT`, deleted: false, created_at: ago(500)!, current: null, lock });

/** The shared lab: four people on one IDEA-06, Ben on a clone also named IDEA-06, two computers on 0.5.0. */
const LAB_TEAM: ArmoryMember[] = [
	member('ana@x', [device('ana-06', 'IDEA-06', 1, LAB), device('ana-home', 'Ana laptop', 600, 'c0ffee000001')]),
	member('ben@x', [device('ben-06', 'IDEA-06', 2, CLONE)]),
	member('diego@x', [device('diego-06', 'IDEA-06', 25, LAB)]),
	member('priya@x', [device('priya-06', 'IDEA-06', 300, LAB)]),
	member('sam@x', [device('sam-06', 'IDEA-06', 2880, LAB)]),
	member('pina@x', [device('pina-desk', 'Room 214 desk', 4, null)]),
	member('maria@x', [device('maria-07', 'Lab PC 7', 180, null)])
];
const LAB_FILES = [file('f-ana', lockOn('ana@x', 'ana-06', 'IDEA-06')), file('f-diego', lockOn('diego@x', 'diego-06', 'IDEA-06')), file('f-ben', lockOn('ben@x', 'ben-06', 'IDEA-06')), file('f-free', null)];

/** The same team as a database without 0310 answers it: no "computer" key at all. */
const withoutTokens = (members: ArmoryMember[]): ArmoryMember[] =>
	members.map((m) => ({ ...m, devices: (m.devices ?? []).map(({ computer: _c, ...d }) => d) }));

describe('which computer a device is on', () => {
	test('the token decides when there is one; the name when there is not; the id when there is neither', () => {
		expect(computerKey({ id: 'a', name: 'IDEA-06', computer: LAB })).toBe(`c:${LAB}`);
		expect(computerKey({ id: 'a', name: '  IDEA-06 ', computer: null })).toBe('n:idea-06');
		expect(computerKey({ id: 'a', name: 'IDEA-06' })).toBe('n:idea-06');
		expect(computerKey({ id: 'a', name: '', computer: '  ' })).toBe('d:a');
	});

	test('one computer five people signed in to is one group, a clone with the same name is another, freshest first', () => {
		const groups = computerGroups(LAB_TEAM.flatMap((m) => m.devices ?? []));
		expect(groups.map((g) => g.map((d) => d.id))).toEqual([
			['ana-06', 'diego-06', 'priya-06', 'sam-06'],
			['ana-home'],
			['ben-06'],
			['pina-desk'],
			['maria-07']
		]);
	});

	test('a keyed device and a keyless one with the same name are never put together', () => {
		const groups = computerGroups([device('new', 'IDEA-06', 1, LAB), device('old', 'IDEA-06', 5, null)]);
		expect(groups).toHaveLength(2);
		// Two keyless devices with one name still fold, as ledger 0430 made them.
		expect(computerGroups([device('a', 'IDEA-06', 1), device('b', 'idea-06 ', 5)])).toHaveLength(1);
	});
});

describe('presenceDevices: one line per computer for one member', () => {
	test('two sign-ins on one computer are one line, the one heard from last; two clones are two lines', () => {
		const ana = [device('old-06', 'IDEA-06', 60, LAB), device('new-06', 'IDEA-06', 1, LAB), device('clone', 'IDEA-06', 3, CLONE)];
		expect(presenceDevices(ana).map((d) => d.id)).toEqual(['new-06', 'clone']);
	});

	test('without tokens it folds by name exactly as before 0441', () => {
		const ana = [device('old-06', 'IDEA-06', 60), device('new-06', 'IDEA-06', 1), device('laptop', 'Ana laptop', 3)];
		expect(presenceDevices(ana).map((d) => d.id)).toEqual(['new-06', 'laptop']);
	});
});

describe('teamComputers: the Team view, one line per computer', () => {
	test('five computers; the shared one lists its four people, most recent first', () => {
		const computers = teamComputers(LAB_TEAM);
		expect(computers.map((c) => [c.device.id, c.people])).toEqual([
			['ana-06', ['ana@x', 'diego@x', 'priya@x', 'sam@x']],
			['ben-06', ['ben@x']],
			['pina-desk', ['pina@x']],
			['maria-07', ['maria@x']],
			['ana-home', ['ana@x']]
		]);
		// One line per computer and never a person twice on one line, in both directions.
		expect(computers).toHaveLength(5);
		expect(computers.every((c) => new Set(c.people).size === c.people.length)).toBe(true);
		expect(computers.some((c) => 'owner' in c.device)).toBe(false);
	});

	test('a person on two sign-ins of one computer is named once', () => {
		const computers = teamComputers([member('ana@x', [device('a1', 'IDEA-06', 1, LAB), device('a2', 'IDEA-06', 9, LAB)]), member('ben@x', [device('b1', 'IDEA-06', 4, LAB)])]);
		expect(computers.map((c) => c.people)).toEqual([['ana@x', 'ben@x']]);
	});

	test('a team with no computers has no lines', () => {
		expect(teamComputers([member('ana@x', [])])).toEqual([]);
	});
});

describe('labels: the Files and Checked out views name a device by its computer', () => {
	test('both checkouts on the shared computer read one label; the clone reads its own', () => {
		const { files, checkouts, labels } = labelProjectDevices(LAB_FILES, checkoutsFromFiles(LAB_FILES), LAB_TEAM);
		const byFile = Object.fromEntries(files.map((f) => [f.id, f.lock?.holder_device_name ?? null]));
		expect(byFile).toEqual({ 'f-ana': 'IDEA-06 (3fa1)', 'f-diego': 'IDEA-06 (3fa1)', 'f-ben': 'IDEA-06 (b2c4)', 'f-free': null });
		expect(Object.fromEntries(checkouts.map((c) => [c.file_id, c.device_name]))).toEqual({ 'f-ana': 'IDEA-06 (3fa1)', 'f-diego': 'IDEA-06 (3fa1)', 'f-ben': 'IDEA-06 (b2c4)' });
		// Every sign-in on the shared computer carries its label, not only the ones holding files.
		expect(['ana-06', 'diego-06', 'priya-06', 'sam-06'].map((id) => labels.get(id))).toEqual(Array(4).fill('IDEA-06 (3fa1)'));
		expect(labels.get('pina-desk')).toBe('Room 214 desk');
	});

	test('a shared computer with no clone reads its plain name for everyone on it', () => {
		const team = [member('ana@x', [device('a', 'IDEA-07', 1, LAB)]), member('ben@x', [device('b', 'IDEA-07', 2, LAB)])];
		expect([...deviceLabels(team.flatMap((m) => m.devices ?? [])).values()]).toEqual(['IDEA-07', 'IDEA-07']);
	});

	test('without tokens two devices that share a name keep their id labels, exactly as Armory 0.3.3 wrote them', () => {
		const { files } = labelProjectDevices(LAB_FILES, checkoutsFromFiles(LAB_FILES), withoutTokens(LAB_TEAM));
		const byFile = Object.fromEntries(files.filter((f) => f.lock).map((f) => [f.id, f.lock!.holder_device_name]));
		expect(byFile).toEqual({ 'f-ana': 'IDEA-06 (ana-)', 'f-diego': 'IDEA-06 (dieg)', 'f-ben': 'IDEA-06 (ben-)' });
	});
});
