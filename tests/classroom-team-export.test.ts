// tests/classroom-team-export.test.ts
//
// THE TEAM EXPORT, OPENED AND READ RATHER THAN ASSERTED FROM THE WRITER.
//
// Every assertion below goes through `parseCsv`, a small RFC4180 reader written
// here and used by nothing else. That is the point: comparing `teamsCsv`'s
// output against a string this file also builds would be the implementation
// agreeing with itself, and it would pass just as happily over a file no
// spreadsheet can open. Parsing it back is the cheapest available stand-in for
// somebody double-clicking the file.
//
// THE ONE THING THIS FILE CARES ABOUT MOST IS THE FORMULA GUARD. A team name is
// a value a STUDENT typed -- 0223 lets any member of a team write it -- so it is
// a strictly more hostile input than anything else this app puts in a CSV, and
// Excel executes a leading `=`, `+`, `-` or `@`. The guard lives in `csvCell`
// and is REUSED rather than rewritten; what is asserted here is that the team
// export actually goes through it, in both the team-name column and the
// display-name column.
//
// WHERE THE EXPECTED VALUES COME FROM: the column ORDER is read off the exported
// `TEAM_CSV_HEADERS` constant (so adding a column is a deliberate edit in one
// place rather than a silent shift), and every VALUE asserted is one this file
// put into the fixture. Nothing is compared against a second call to the writer.

import { describe, expect, test } from 'vitest';
import {
	TEAM_CSV_HEADERS,
	teamMemberRosterLabel,
	teamsCsv,
	teamsCsvFilename
} from '../src/lib/classroom/roster-export';
import {
	TEAM_WINDOW_WORDS,
	canStyleTeam,
	teamDriftNote,
	teamLabel,
	teamRosterCounts,
	teamStyle,
	teamWindowEnd,
	teamWindowState,
	type Team,
	type TeamSet
} from '../src/lib/classroom/teams';
import { accentOf, backgroundCss, hasStyle } from '../src/lib/tournaments/entry-styles';
import type { ClassroomSection } from '../src/lib/classroom/classroom';

// ---------------------------------------------------------------------------
// A CSV reader. Quotes, doubled quotes inside quotes, CRLF between records.
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
	const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (quoted) {
			if (ch === '"') {
				if (body[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
			continue;
		}
		if (ch === '"') quoted = true;
		else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\r' && body[i + 1] === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
			i++;
		} else cell += ch;
	}
	if (cell !== '' || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

/** A column's value on a parsed row, looked up by its header name. */
const col = (headers: string[], row: string[], name: string) => row[headers.indexOf(name)];

const SECTION = {
	id: 'sec-1',
	label: 'Period 3',
	block: 'Block C',
	course: { id: 'c1', code: 'IDEA100', title: 'Intro to Engineering Design' }
} as unknown as ClassroomSection;

const team = (n: number, name: string | null, members: [string, string, boolean][]): Team => ({
	id: `team-${n}`,
	team_number: n,
	name,
	accent_color: null,
	background_type: null,
	background_value: null,
	badge: null,
	flourish: null,
	tagline: null,
	style_updated_by: null,
	style_updated_at: null,
	mine: false,
	members: members.map(([student_email, display_name, still_enrolled]) => ({
		student_email,
		display_name,
		still_enrolled
	}))
});

const SET: TeamSet = {
	id: 'set-1',
	label: 'Build teams',
	seed: '305441741',
	mode: 'count',
	mode_value: 2,
	created_at: '2026-09-22T15:00:00.000Z',
	posted_at: null,
	visible_until: null,
	showing: false,
	teams: [
		team(1, 'The Gearboxes', [
			['alice@boscotech.net', 'Alice Alvarez', true],
			['carla@boscotech.net', 'Carla Cruz', false]
		]),
		team(2, null, [
			['bruno@boscotech.net', 'Bruno Barros', true],
			['dana@boscotech.net', 'Diaz, Dana', true]
		])
	]
};

// ===========================================================================
describe('the exported file opens and reads as a team roster', () => {
	const rows = parseCsv(teamsCsv(SECTION, SET));
	const headers = rows[0];
	const body = rows.slice(1);

	test('it carries a BOM, CRLF records and the declared header row', () => {
		const text = teamsCsv(SECTION, SET);
		expect(text.charCodeAt(0)).toBe(0xfeff);
		expect(text).toContain('\r\n');
		expect(headers).toEqual([...TEAM_CSV_HEADERS]);
	});

	test('every student on every team gets a row, and nobody gets two', () => {
		expect(body).toHaveLength(4);
		expect(body.map((r) => col(headers, r, 'Email')).sort()).toEqual([
			'alice@boscotech.net',
			'bruno@boscotech.net',
			'carla@boscotech.net',
			'dana@boscotech.net'
		]);
	});

	test('rows are ordered by team, then the way a gradebook orders people', () => {
		expect(body.map((r) => [col(headers, r, 'Team'), col(headers, r, 'Last')])).toEqual([
			['1', 'Alvarez'],
			['1', 'Cruz'],
			['2', 'Barros'],
			['2', 'Diaz']
		]);
	});

	test('a named team carries its name and an unnamed one falls back to Team <n>', () => {
		expect(col(headers, body[0], 'Team name')).toBe('The Gearboxes');
		expect(col(headers, body[2], 'Team name')).toBe('Team 2');
	});

	test('the draw label and the SEED ride on every row, which is what makes the file checkable', () => {
		for (const r of body) {
			expect(col(headers, r, 'Draw')).toBe('Build teams');
			expect(col(headers, r, 'Seed')).toBe('305441741');
		}
	});

	test('a student who has left the class is IN the file, with the column that says so', () => {
		const carla = body.find((r) => col(headers, r, 'Email') === 'carla@boscotech.net')!;
		expect(col(headers, carla, 'Roster')).toBe(teamMemberRosterLabel(false));
		const alice = body.find((r) => col(headers, r, 'Email') === 'alice@boscotech.net')!;
		expect(col(headers, alice, 'Roster')).toBe(teamMemberRosterLabel(true));
		// The positive control on the same reading: both labels are present, so
		// "the left-the-class row is there" is not "every row says the same thing".
		expect(new Set(body.map((r) => col(headers, r, 'Roster'))).size).toBe(2);
	});

	test('a "Last, First" display name is split on the comma and does not break the row', () => {
		const dana = body.find((r) => col(headers, r, 'Email') === 'dana@boscotech.net')!;
		expect([col(headers, dana, 'Last'), col(headers, dana, 'First')]).toEqual(['Diaz', 'Dana']);
		expect(dana).toHaveLength(TEAM_CSV_HEADERS.length);
	});

	test('the class and block columns name the class the export is about', () => {
		expect(col(headers, body[0], 'Class')).toBe('IDEA100 Period 3');
		expect(col(headers, body[0], 'Block')).toBe('Block C');
	});
});

// ===========================================================================
describe('a student-authored team name cannot execute in a spreadsheet', () => {
	// 0223 lets ANY member of a team write this string. It is the most hostile
	// input in the file.
	const hostile = parseCsv(
		teamsCsv(SECTION, {
			...SET,
			teams: [
				team(1, '=HYPERLINK("http://evil","click")', [
					['alice@boscotech.net', '@SUM(1+1)', true],
					['bruno@boscotech.net', 'Quote " and, comma', true]
				])
			]
		})
	);
	const headers = hostile[0];

	test('a leading = on a team name is neutralized by the shared guard', () => {
		const v = col(headers, hostile[1], 'Team name');
		expect(v.startsWith('=')).toBe(false);
		expect(v).toBe('\'=HYPERLINK("http://evil","click")');
	});

	test('a leading @ on a display name is neutralized too', () => {
		// splitLastFirst puts a single-word name in `Last`.
		expect(col(headers, hostile[1], 'Last')).toBe("'@SUM(1+1)");
	});

	test('a quote and a comma survive the round trip intact, so no row is split', () => {
		const row = hostile.find((r) => col(headers, r, 'Email') === 'bruno@boscotech.net')!;
		expect(row).toHaveLength(TEAM_CSV_HEADERS.length);
		// `splitLastFirst` reads a comma in a display name as "Last, First", so
		// the quote lands in Last. Asserted against that documented contract
		// rather than against what came out.
		expect([col(headers, row, 'Last'), col(headers, row, 'First')]).toEqual([
			'Quote " and',
			'comma'
		]);
	});
});

// ===========================================================================
describe('a team with nobody on it still appears', () => {
	test('an emptied team gets a row saying so rather than vanishing from the file', () => {
		const rows = parseCsv(
			teamsCsv(SECTION, { ...SET, teams: [team(1, 'Empty', []), SET.teams[1]] })
		);
		const headers = rows[0];
		expect(rows.slice(1).map((r) => col(headers, r, 'Team'))).toEqual(['1', '2', '2']);
		expect(col(headers, rows[1], 'Roster')).toBe('No students on this team');
	});
});

// ===========================================================================
describe('the filename', () => {
	test('names the class, the draw and the day, and is safe on every filesystem', () => {
		const name = teamsCsvFilename(SECTION, { label: 'Build teams' }, Date.parse('2026-09-22T19:30:00Z'));
		expect(name).toBe('idea100-period-3-build-teams-2026-09-22-teams.csv');
		expect(name).toMatch(/^[a-z0-9.-]+$/);
	});

	test('a draw label of nothing but punctuation cannot produce a leading or trailing dash', () => {
		const name = teamsCsvFilename(SECTION, { label: '!!!' }, Date.parse('2026-09-22T19:30:00Z'));
		expect(name).toBe('idea100-period-3-2026-09-22-teams.csv');
	});
});

// ===========================================================================
describe('the posting window, read at a pinned instant', () => {
	const NOW = Date.parse('2026-09-22T18:00:00.000Z');
	const W = (posted: string | null, until: string | null) =>
		teamWindowState({ posted_at: posted, visible_until: until }, NOW);

	test('never posted', () => {
		expect(W(null, null)).toBe('not-posted');
	});
	test('posted with no end is showing', () => {
		expect(W('2026-09-22T17:00:00.000Z', null)).toBe('showing');
	});
	test('posted inside its window is showing', () => {
		expect(W('2026-09-22T17:00:00.000Z', '2026-09-22T19:00:00.000Z')).toBe('showing');
	});
	test('a window whose end has passed is ended, not showing', () => {
		expect(W('2026-09-20T17:00:00.000Z', '2026-09-21T19:00:00.000Z')).toBe('ended');
	});
	test('a start in the future is scheduled, not showing', () => {
		expect(W('2026-09-23T17:00:00.000Z', null)).toBe('scheduled');
	});
	test('the end is exclusive at the exact instant it lands', () => {
		expect(W('2026-09-22T17:00:00.000Z', '2026-09-22T18:00:00.000Z')).toBe('ended');
	});
	test('every state has a sentence, so a state cannot render blank', () => {
		for (const s of ['not-posted', 'scheduled', 'showing', 'ended'] as const) {
			expect(TEAM_WINDOW_WORDS[s].length).toBeGreaterThan(10);
		}
	});
});

describe('a posting end built from a number of days', () => {
	const NOW = Date.parse('2026-09-22T18:00:00.000Z');

	test('null days is no end at all', () => {
		expect(teamWindowEnd(NOW, null)).toBeNull();
		expect(teamWindowEnd(NOW, 0)).toBeNull();
		expect(teamWindowEnd(NOW, -3)).toBeNull();
	});

	test('one day lands at the END of that day, not at the same clock time tomorrow', () => {
		const end = teamWindowEnd(NOW, 1)!;
		const d = new Date(end);
		// "post these for a day" means through tomorrow, which is the whole
		// reason this is not `now + 24h`.
		expect(d.getHours()).toBe(23);
		expect(d.getMinutes()).toBe(59);
		expect(d.getTime()).toBeGreaterThan(NOW);
	});

	test('the end always sits after the start, which is what 0223 CHECKs', () => {
		for (const days of [1, 2, 5, 7, 30]) {
			expect(Date.parse(teamWindowEnd(NOW, days)!)).toBeGreaterThan(NOW);
		}
	});
});

// ===========================================================================
describe('the pure helpers a surface reads', () => {
	test('teamLabel prefers the students\' own name and never renders blank', () => {
		expect(teamLabel({ name: 'The Gearboxes', team_number: 1 })).toBe('The Gearboxes');
		expect(teamLabel({ name: null, team_number: 4 })).toBe('Team 4');
		expect(teamLabel({ name: '   ', team_number: 4 })).toBe('Team 4');
	});

	test('teamRosterCounts separates who is on the team from who is still in the class', () => {
		expect(teamRosterCounts(SET.teams[0])).toEqual({ total: 2, enrolled: 1 });
		expect(teamRosterCounts(SET.teams[1])).toEqual({ total: 2, enrolled: 2 });
	});

	test('teamDriftNote is null when nothing has moved, and names the people when it has', () => {
		expect(teamDriftNote({ teams: [SET.teams[1]] })).toBeNull();
		const one = teamDriftNote({ teams: [SET.teams[0]] })!;
		expect(one).toContain('Carla Cruz');
		expect(one).toContain('left exactly as it was drawn');
		const two = teamDriftNote({
			teams: [SET.teams[0], team(3, null, [['e@x.net', 'Erik Estrada', false]])]
		})!;
		expect(two).toContain('2 students');
		expect(two).toContain('Erik Estrada');
	});

	test('canStyleTeam is one predicate: a member, or a teacher of the class', () => {
		expect(canStyleTeam({ mine: true }, false)).toBe(true);
		expect(canStyleTeam({ mine: false }, true)).toBe(true);
		expect(canStyleTeam({ mine: false }, false)).toBe(false);
	});
});

// ===========================================================================
describe('a team hands the tournament renderers a shape they already take', () => {
	// The point of this block: proving the D2 extraction is NOT needed for a
	// team to render, because every one of these functions takes
	// `EntryStyleDraft`, which excludes `entry_id` and `tournament_id`.
	test('an unstyled team reads as having no style and falls back to the neutral accent', () => {
		const plain = teamStyle(SET.teams[1]);
		expect(hasStyle(plain)).toBe(false);
		expect(backgroundCss(plain)).toBeNull();
		expect(accentOf(plain)).toMatch(/^#[0-9a-f]{6}$/i);
	});

	test('a styled team renders its accent and its background through the shared functions', () => {
		const styled = teamStyle({
			...SET.teams[0],
			accent_color: '#3f8f5f',
			background_type: 'gradient',
			background_value: ['#102015', '#1c3326']
		});
		expect(hasStyle(styled)).toBe(true);
		expect(accentOf(styled)).toBe('#3f8f5f');
		const css = backgroundCss(styled)!;
		expect(css).toContain('#102015');
		expect(css).toContain('#1c3326');
	});
});
