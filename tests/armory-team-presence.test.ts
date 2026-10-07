// tests/armory-team-presence.test.ts
//
// THE ARMORY PROJECT PAGE'S PURE DECISIONS (round of 2026-10-07), where a
// regression would be silent:
//
//   - PRESENCE NEVER SAYS "OFFLINE". An instrument's silence is never a fact
//     about a student (CLAUDE.md, "WHO IS WORKING"). Swept across every state
//     the app can send and every age, with "Armory open" and "Last heard from"
//     as the positive controls, so a sweep that produced nothing cannot pass.
//   - ONLY THE VIEW GOES IN THE ADDRESS, and an unknown or forbidden view falls
//     back to Files.
//   - DELETE FOREVER'S ONE PREDICATE agrees with what the RPC compares (trimmed
//     and NFC), in both directions.
//   - THE CHECKOUT TABLE'S holder keys add up to the whole list, and the
//     search and holder filters keep the rows they should.

import { describe, expect, test } from 'vitest';
import { filterCheckouts, holderChips, holderFilterOf, oldestFirst } from '../src/lib/armory/checkouts';
import { projectViewFromHash, projectViewHref, projectViewOf, projectViewsFor, PROJECT_VIEWS } from '../src/lib/armory/nav';
import {
	addPeople,
	addPeopleWords,
	ARMORY_ONLINE_MS,
	devicePresence,
	noComputerWords,
	purgeCanSend,
	purgeConfirmValue,
	purgeCostWords,
	searchable,
	sortTeam,
	teamNames
} from '../src/lib/armory/team';
import { activityWords, breakLockWords, sizeWords, VERBS, type ArmoryCheckout, type ArmoryMember } from '../src/lib/armory/view';

const NOW = Date.parse('2026-10-07T17:30:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('presence never says offline', () => {
	const STATES = ['idle', 'syncing', 'offline-soon', null, undefined, 'something-new'];
	const AGES = [0, 30_000, ARMORY_ONLINE_MS, ARMORY_ONLINE_MS + 1, 10 * 60_000, 3 * 3600_000, 40 * 86400_000, -60_000];

	test('every state at every age, and a computer that never sent a status', () => {
		const words: string[] = [];
		for (const state of STATES) {
			for (const age of AGES) words.push(devicePresence({ last_seen: ago(age), state }, NOW).words);
			words.push(devicePresence({ last_seen: null, state }, NOW).words);
			words.push(devicePresence({ last_seen: 'not a time', state }, NOW).words);
		}
		expect(words.length).toBe(STATES.length * (AGES.length + 2));
		for (const w of words) expect(w.toLowerCase()).not.toMatch(/\boff ?line\b/);
		// Positive controls: the sweep produced the three readings it should.
		expect(words.some((w) => w === 'Armory open')).toBe(true);
		expect(words.some((w) => w.startsWith('Last heard from '))).toBe(true);
		expect(words.some((w) => w.startsWith('No status from this computer yet'))).toBe(true);
	});

	test('inside the window is open, outside it says when, and the boundary is the window', () => {
		expect(devicePresence({ last_seen: ago(ARMORY_ONLINE_MS), state: 'idle' }, NOW)).toMatchObject({ tone: 'open', words: 'Armory open' });
		expect(devicePresence({ last_seen: ago(30_000), state: 'syncing' }, NOW).words).toBe('Armory open, syncing');
		const late = devicePresence({ last_seen: ago(ARMORY_ONLINE_MS + 1), state: 'idle' }, NOW);
		expect(late.tone).toBe('heard');
		expect(late.words).toMatch(/^Last heard from \d{1,2}:\d{2} [AP]M$/);
		expect(devicePresence({ last_seen: ago(3 * 86400_000), state: 'idle' }, NOW).words).toMatch(/^Last heard from Oct 4, /);
	});

	test('no computer listed: a fact only when the server counted the registrations', () => {
		expect(noComputerWords({ devices_total: 0 })).toBe('No computer connected yet');
		expect(noComputerWords({ devices_total: 2 })).not.toMatch(/connected yet/);
		expect(noComputerWords({})).not.toMatch(/connected yet/);
		for (const w of [noComputerWords({}), noComputerWords({ devices_total: 3 })]) expect(w.toLowerCase()).not.toContain('offline');
	});
});

describe('the project views', () => {
	test('the five views, the Project view only for those offered it', () => {
		expect([...PROJECT_VIEWS]).toEqual(['files', 'checked-out', 'team', 'activity', 'project']);
		expect(projectViewsFor({ settings: true })).toHaveLength(5);
		expect(projectViewsFor({ settings: false })).toEqual(['files', 'checked-out', 'team', 'activity']);
	});

	test('a view is read from ?view= and falls back to Files', () => {
		expect(projectViewOf('team', { settings: false })).toBe('team');
		expect(projectViewOf('project', { settings: true })).toBe('project');
		// Both directions: a forbidden view and an unknown one are Files.
		expect(projectViewOf('project', { settings: false })).toBe('files');
		expect(projectViewOf('people', { settings: true })).toBe('files');
		expect(projectViewOf(null, { settings: true })).toBe('files');
		expect(projectViewHref('checked-out')).toBe('?view=checked-out');
		expect(projectViewFromHash('#people')).toBe('team');
		expect(projectViewFromHash('#create')).toBeNull();
	});
});

describe('Delete forever: one predicate, the RPC comparison', () => {
	test('exactly the name, trimmed and NFC, and nothing else', () => {
		expect(purgeCanSend('Robot 2025', 'Robot 2025')).toBe(true);
		expect(purgeCanSend('  Robot 2025\n', 'Robot 2025')).toBe(true);
		expect(purgeCanSend('Café', 'Café')).toBe(true);
		expect(purgeConfirmValue(' Café ')).toBe('Café');
		// The other direction.
		expect(purgeCanSend('', 'Robot 2025')).toBe(false);
		expect(purgeCanSend('robot 2025', 'Robot 2025')).toBe(false);
		expect(purgeCanSend('Robot  2025', 'Robot 2025')).toBe(false);
		expect(purgeCanSend('Robot 202', 'Robot 2025')).toBe(false);
	});

	test('the cost sentence carries the real counts and says what is kept', () => {
		const words = purgeCostWords(
			{ name: 'R', files: 212, live_files: 198, versions: 1604, side_versions: 37, checkouts: 2, blobs: 1390, bytes: 3_221_225_472 },
			sizeWords
		);
		for (const part of ['212 files (14 already removed)', '1,604 versions', '37 side versions', '2 checkouts are released', '3.00 GB', '1,390 files', 'cannot be undone']) {
			expect(words).toContain(part);
		}
		expect(purgeCostWords({ name: 'R', files: 1, live_files: 1, versions: 1, side_versions: 0, checkouts: 0, blobs: 0, bytes: 0 }, sizeWords)).toContain(
			'nothing is removed from storage'
		);
	});
});

describe('the checkout table', () => {
	const ME = 'apina@boscotech.edu';
	const row = (name: string, holder: string, minutes: number, folder = 'Drive'): ArmoryCheckout => ({
		file_id: `f-${name}`,
		folder,
		name,
		holder_email: holder,
		holder_name: null,
		device_name: 'Lab PC 3',
		since: ago(minutes * 60_000)
	});
	const ROWS = [row('B', 'ana@x', 5), row('A', 'ana@x', 50), row('C', ME, 20), row('D', 'ben@x', 10, 'Intake')];
	const NAMES = new Map<string, string | null>([['ana@x', 'Ana Reyes']]);

	test('oldest first', () => {
		expect(oldestFirst(ROWS).map((r) => r.name)).toEqual(['A', 'C', 'D', 'B']);
	});

	test('the holder keys add up to the whole list, the viewer once (as Mine)', () => {
		const chips = holderChips(ROWS, ME, NAMES);
		expect(chips[0]).toEqual({ id: 'all', label: 'Everyone', count: 4 });
		expect(chips[1]).toEqual({ id: 'me', label: 'Mine', count: 1 });
		expect(chips.slice(2).map((c) => c.label)).toEqual(['Ana Reyes', 'ben']);
		expect(chips.slice(1).reduce((n, c) => n + c.count, 0)).toBe(4);
	});

	test('the holder and the search keep the rows they should, and nothing else', () => {
		expect(filterCheckouts(ROWS, 'ana@x', '', ME, NAMES).map((r) => r.name)).toEqual(['A', 'B']);
		expect(filterCheckouts(ROWS, 'me', '', ME, NAMES).map((r) => r.name)).toEqual(['C']);
		expect(filterCheckouts(ROWS, 'all', 'intake', ME, NAMES).map((r) => r.name)).toEqual(['D']);
		expect(filterCheckouts(ROWS, 'all', 'reyes', ME, NAMES).map((r) => r.name)).toEqual(['A', 'B']);
		expect(filterCheckouts(ROWS, 'ben@x', 'reyes', ME, NAMES)).toEqual([]);
	});

	test('a linked holder that names nobody in the list reads as Everyone', () => {
		expect(holderFilterOf('me', ROWS)).toBe('me');
		expect(holderFilterOf('ana@x', ROWS)).toBe('ana@x');
		expect(holderFilterOf('nobody@x', ROWS)).toBe('all');
		expect(holderFilterOf(null, ROWS)).toBe('all');
	});
});

describe('one name for one person', () => {
	const team: ArmoryMember[] = [
		{ email: 'jv@x', role: 'student', name: 'Shadow' },
		{ email: 'ana@x', role: 'student', name: null }
	];
	test('the team name wins over a checkout holder name; an absent name falls back to the address', () => {
		const names = teamNames(team, [
			{ file_id: 'f', folder: '', name: 'n', holder_email: 'jv@x', holder_name: 'Old Name', device_name: null, since: ago(0) },
			{ file_id: 'g', folder: '', name: 'n', holder_email: 'ana@x', holder_name: 'Ana Reyes', device_name: null, since: ago(0) }
		]);
		expect(names.get('jv@x')).toBe('Shadow');
		expect(names.get('ana@x')).toBe('Ana Reyes');
		const change = { cursor: 1, kind: 'lock_broken', entity_id: 'f', payload: { by: 'ana@x', former_holder: 'jv@x' }, created_at: ago(0) };
		expect(activityWords(change, () => 'Plate.SLDPRT', false, names)).toBe('Ana Reyes forced a check in of Plate.SLDPRT from Shadow');
		// Without the map, the address's first part, as before.
		expect(activityWords(change, () => 'Plate.SLDPRT')).toBe('ana forced a check in of Plate.SLDPRT from jv');
	});

	test('mentors first, then by name', () => {
		const sorted = sortTeam<ArmoryMember>([
			{ email: 'z@x', role: 'student', name: 'Aaron' },
			{ email: 'm@x', role: 'mentor', name: 'Zed' },
			{ email: 'c@x', role: 'cad_lead', name: 'Cy' }
		]);
		expect(sorted.map((m) => m.email)).toEqual(['m@x', 'c@x', 'z@x']);
	});

	test('a folder deleted forever is a line of activity, not a silent drop', () => {
		const change = { cursor: 2, kind: 'folder_purged', entity_id: 'p', payload: { by: 'ana@x', folder: 'Old Intake', files: 3 }, created_at: ago(0) };
		expect(activityWords(change, () => null)).toBe('ana deleted the folder Old Intake forever (3 files)');
	});
});

describe('the words', () => {
	test('the fourth verb is Force check in (decision of 2026-10-07)', () => {
		expect(VERBS.takeBack).toBe('Force check in');
	});

	test('Force check in refusals are matched by the RPC text, not a SQLSTATE', () => {
		expect(breakLockWords('only a mentor or cad_lead may break a lock')).toBe('Only a mentor, a CAD lead or a site admin can force a check in.');
		expect(breakLockWords('device is not registered to caller')).toContain('one of your computers connected');
		expect(breakLockWords('nothing changed')).toBe('It was already checked in.');
		expect(breakLockWords('something else')).toBe('That did not work. Try again in a minute.');
	});

	test('a search needs two characters that are not spaces', () => {
		expect(searchable('a')).toBe(false);
		expect(searchable(' a ')).toBe(false);
		expect(searchable('an')).toBe(true);
		expect(searchable('a n')).toBe(true);
	});
});

describe('adding people: one loop for the picker and the paste box', () => {
	test('one refusal never hides the rest, the reload is held, and the sentence counts each', async () => {
		const asked: Array<{ email: string; refresh: boolean | undefined }> = [];
		const result = await addPeople(['a@x', 'b@x', 'c@x', 'd@x'], 'student', [{ email: 'b@x', role: 'student' }], async (email, _role, opts) => {
			asked.push({ email, refresh: opts?.refresh });
			if (email === 'c@x') return { ok: false, message: 'a valid email is required' };
			if (email === 'd@x') return { ok: false, message: 'nothing changed' };
			return { ok: true };
		});
		expect(result).toEqual({ added: ['a@x'], already: ['b@x', 'd@x'], failed: [{ email: 'c@x', why: 'Type a full school email address.' }] });
		// b@x already had the role and was never sent; every send held the reload.
		expect(asked.map((a) => a.email)).toEqual(['a@x', 'c@x', 'd@x']);
		expect(asked.every((a) => a.refresh === false)).toBe(true);
		expect(addPeopleWords(result, 'student')).toBe('Added 1 as Student. 2 already had that role. Not added: c@x (Type a full school email address.)');
	});
});
