// tests/dom/people-team-edits-mount.test.ts
//
// CHANGING A SAVED DRAW BY HAND ON THE PEOPLE TAB (0225, decision 44, report
// R18), ON THE REAL COMPONENT.
//
// Mr. Pina posted a draw, a student was absent, and the only way to fix one
// team was to draw every team again. A move is now a write in place, reached
// two ways (a drag onto another team card, and a Move to control on every
// member), and both call ONE handler. What this file holds is the half a
// person checking by eye cannot see:
//
//   1. Move to calls the move transport with the draw, the student and the
//      target team, and nothing else; the board is re-read and the move is
//      announced in words.
//   2. Students on the roster and on no team of the draw are offered, and only
//      them: not a manager's own enrollment, not a deactivated student, not
//      somebody already on a team.
//   3. ABSENCE IS THE MECHANISM: a deployment without 0225 (the board's sets
//      carry no `edited_at` key, or the move answers `unavailable`) gets NO
//      grip and NO Move to, and a sentence saying why -- with the ready case as
//      the positive control in the same file, so a zero cannot mean "the
//      selector was renamed".
//   4. A rename goes through the style write with every other style field
//      carried over, because that write replaces all six columns and a rename
//      built from the name alone would wipe a banner the students made.
//
// Structure, events and call arguments only (happy-dom has no layout engine).
// The drag with a pointer, the 44px floors and the contrast are
// tools/browser-verify/routes/classroom-teams-state-edit.mjs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import PeoplePanel from '../../src/lib/classroom/PeoplePanel.svelte';
import type { ClassroomEnrollment } from '../../src/lib/classroom/classroom';
import type {
	SaveTeamStyleInput,
	TeamBoard,
	TeamMoveResult,
	TeamSet,
	TeamTransports
} from '../../src/lib/classroom/teams';
import { mountInto, type Mounted } from './mount';

const SECTION = {
	id: 's1',
	course_id: 'c1',
	label: 'Period 1',
	block: 'A',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

function enrol(email: string, name: string, extra: Partial<ClassroomEnrollment> = {}): ClassroomEnrollment {
	return {
		section_id: 's1',
		student_email: email,
		display_name: name,
		active: true,
		manages: false,
		...extra
	} as ClassroomEnrollment;
}

const ROSTER: ClassroomEnrollment[] = [
	enrol('ana@boscotech.net', 'Ana Reyes'),
	enrol('ben@boscotech.net', 'Ben Okafor'),
	enrol('dee@boscotech.net', 'Dee Marsh'),
	// On the roster and on no team: the one "Not on a team yet" must list.
	enrol('FAY@boscotech.net', 'Fay Lund'),
	// Deactivated: not offered.
	enrol('gus@boscotech.net', 'Gus Pratt', { active: false }),
	// The teacher's own enrollment: never a student row.
	enrol('vargas@boscotech.edu', 'Ms. Vargas', { manages: true })
];

function team(id: string, n: number, members: [string, string][], extra: Record<string, unknown> = {}) {
	return {
		id,
		team_number: n,
		name: null,
		accent_color: null,
		background_type: null,
		background_value: null,
		badge: null,
		flourish: null,
		tagline: null,
		style_updated_by: null,
		style_updated_at: null,
		mine: false,
		members: members.map(([student_email, display_name]) => ({
			student_email,
			display_name,
			still_enrolled: true
		})),
		...extra
	};
}

function draw(extra: Partial<TeamSet> = {}): TeamSet {
	return {
		id: 'set-1',
		label: 'Lab pairs',
		seed: '4242',
		mode: 'size',
		mode_value: 2,
		created_at: '2026-09-28T15:00:00.000Z',
		posted_at: null,
		visible_until: null,
		showing: false,
		edited_at: null,
		edited_by: null,
		teams: [
			team('t-1', 1, [
				['ana@boscotech.net', 'Ana Reyes'],
				// Case differs from the roster's own spelling on purpose.
				['BEN@boscotech.net', 'Ben Okafor']
			]),
			team('t-2', 2, [['dee@boscotech.net', 'Dee Marsh']], {
				name: 'Torque Squad',
				accent_color: '#3fb950',
				background_type: 'gradient',
				background_value: 'sunset',
				badge: 'bolt',
				flourish: 'sparkle',
				tagline: 'We lift things'
			})
		],
		...extra
	} as TeamSet;
}

interface Fake {
	transports: TeamTransports;
	moves: [string, string, string][];
	styles: SaveTeamStyleInput[];
	boards: number;
}

function fake(opts: { set?: TeamSet; editsReady?: boolean; move?: TeamMoveResult } = {}): Fake {
	const f: Fake = { transports: {} as TeamTransports, moves: [], styles: [], boards: 0 };
	f.transports = {
		async board(): Promise<TeamBoard> {
			f.boards += 1;
			return {
				ok: true,
				manages: true,
				editsReady: opts.editsReady ?? true,
				sets: [opts.set ?? draw()]
			};
		},
		async move(setId, email, toTeamId) {
			f.moves.push([setId, email, toTeamId]);
			return opts.move ?? { ok: true, moved: true, added: false };
		},
		async style(input) {
			f.styles.push(input);
			return { ok: true };
		}
	} as TeamTransports;
	return f;
}

let mounted: Mounted | null = null;
afterEach(async () => {
	vi.useRealTimers();
	await mounted?.stop();
	mounted = null;
});

async function openTeams(f: Fake): Promise<Mounted> {
	mounted = mountInto(PeoplePanel as never, {
		section: SECTION,
		roster: ROSTER,
		transports: {},
		teams: f.transports
	});
	mounted.one<HTMLButtonElement>('[data-testid="tool-teams"]').click();
	await mounted.settle();
	await mounted.settle();
	return mounted;
}

function choose(select: HTMLSelectElement, value: string) {
	select.value = value;
	select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Move to moves a student through the one move transport', () => {
	it('calls move with the draw, the student and the target team, re-reads, and says so in words', async () => {
		const f = fake();
		const m = await openTeams(f);
		const before = f.boards;
		const selects = m.all<HTMLSelectElement>('[data-testid="team-move"]');
		// One per member on a team: Ana, Ben, Dee.
		expect(selects.length).toBe(3);
		const ana = selects.find((s) => s.getAttribute('aria-label')?.includes('Ana Reyes'));
		expect(ana, 'the control names the student it moves').toBeTruthy();
		// Its options are the OTHER teams, by their label.
		expect([...ana!.options].map((o) => o.textContent?.trim())).toEqual(['Move to', 'Torque Squad']);
		choose(ana!, 't-2');
		await m.settle();
		await m.settle();
		expect(f.moves).toEqual([['set-1', 'ana@boscotech.net', 't-2']]);
		expect(f.boards).toBe(before + 1);
		expect(m.one('[data-testid="team-edit-note"]').textContent?.trim()).toBe(
			'Moved Ana Reyes to Torque Squad.'
		);
		// The control resets, so the next choice is a change again.
		expect(m.all<HTMLSelectElement>('[data-testid="team-move"]').every((s) => s.value === '')).toBe(true);
	});

	it('a refusal renders beside the draw in the database’s own sentence', async () => {
		const f = fake({ move: { ok: false, reason: 'error', message: 'That student is not enrolled in this class.' } });
		const m = await openTeams(f);
		choose(m.all<HTMLSelectElement>('[data-testid="team-move"]')[0], 't-2');
		await m.settle();
		expect(m.one('[data-testid="team-edit-refusal"]').textContent?.trim()).toBe(
			'That student is not enrolled in this class.'
		);
		// A refusal is not the missing-migration state: the controls stay.
		expect(m.all('[data-testid="team-move"]').length).toBe(3);
	});
});

describe('students on no team of the draw are offered, and only them', () => {
	it('lists the one active student on no team, and Add to calls the same move', async () => {
		const f = fake();
		const m = await openTeams(f);
		const rows = m.all('[data-testid="team-unteamed-member"]');
		expect(rows.map((r) => r.querySelector('.team-member-name')?.textContent?.trim())).toEqual(['Fay Lund']);
		// Not the deactivated student, not the teacher, not Ben (whose board
		// spelling differs only in case).
		const text = m.one('[data-testid="team-unteamed"]').textContent ?? '';
		for (const absent of ['Gus Pratt', 'Ms. Vargas', 'Ben Okafor']) expect(text).not.toContain(absent);
		const add = m.one<HTMLSelectElement>('[data-testid="team-add"]');
		expect([...add.options].map((o) => o.textContent?.trim())).toEqual(['Add to', 'Team 1', 'Torque Squad']);
		choose(add, 't-1');
		await m.settle();
		expect(f.moves).toEqual([['set-1', 'FAY@boscotech.net', 't-1']]);
	});

	it('draws no such card when everybody is on a team', async () => {
		const set = draw();
		set.teams[0].members.push({ student_email: 'fay@boscotech.net', display_name: 'Fay Lund', still_enrolled: true });
		const m = await openTeams(fake({ set }));
		expect(m.all('[data-testid="team-unteamed"]').length).toBe(0);
		expect(m.all('[data-testid="team-move"]').length).toBe(4);
	});
});

describe('absence is the mechanism: no 0225, no move controls', () => {
	it('the ready deployment has a grip and a Move to on every member (the positive control)', async () => {
		const m = await openTeams(fake());
		// 3 members + 1 unteamed student each get a grip; Move to is the 3 on teams.
		expect(m.all('[data-testid="team-grip"]').length).toBe(4);
		expect(m.all('[data-testid="team-move"]').length).toBe(3);
		expect(m.all('[data-testid="team-add"]').length).toBe(1);
		expect(m.all('[data-testid="team-move-unavailable"]').length).toBe(0);
	});

	it('a board with no 0225 key removes every move control up front and says why', async () => {
		const m = await openTeams(fake({ editsReady: false }));
		expect(m.all('[data-testid="team-grip"]').length).toBe(0);
		expect(m.all('[data-testid="team-move"]').length).toBe(0);
		expect(m.all('[data-testid="team-add"]').length).toBe(0);
		expect(m.all('[data-testid="team-unteamed"]').length).toBe(0);
		expect(
			m.one('[data-testid="team-move-unavailable"]').textContent?.replace(/\s+/g, ' ')
		).toContain('database update is applied');
		// The draw itself still renders: what went is the edit, not the teams.
		expect(m.all('[data-testid="team-card"]').length).toBe(2);
	});

	it('a move answering unavailable removes the controls the same way', async () => {
		const f = fake({ move: { ok: false, reason: 'unavailable' } });
		const m = await openTeams(f);
		expect(m.all('[data-testid="team-move"]').length).toBe(3);
		choose(m.all<HTMLSelectElement>('[data-testid="team-move"]')[0], 't-2');
		await m.settle();
		expect(m.all('[data-testid="team-move"]').length).toBe(0);
		expect(m.all('[data-testid="team-grip"]').length).toBe(0);
		expect(m.all('[data-testid="team-move-unavailable"]').length).toBe(1);
		expect(m.all('[data-testid="team-edit-refusal"]').length).toBe(0);
	});
});

describe('a rename keeps the team’s banner', () => {
	it('sends the new name with every other style field carried over', async () => {
		const f = fake();
		const m = await openTeams(f);
		const renames = m.all<HTMLButtonElement>('[data-testid="team-rename"]');
		expect(renames.length).toBe(2);
		const second = renames[1];
		second.click();
		m.flush();
		expect(second.getAttribute('aria-expanded')).toBe('true');
		expect(second.classList.contains('on'), 'the open panel lights its own key').toBe(true);
		const input = m.one<HTMLInputElement>('[data-testid="team-rename-input"]');
		expect(input.value).toBe('Torque Squad');
		input.value = '  Gear Heads  ';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.one<HTMLFormElement>('[data-testid="team-rename-form"]').requestSubmit();
		await m.settle();
		await m.settle();
		expect(f.styles).toEqual([
			{
				teamId: 't-2',
				name: 'Gear Heads',
				accentColor: '#3fb950',
				backgroundType: 'gradient',
				backgroundValue: 'sunset',
				badge: 'bolt',
				flourish: 'sparkle',
				tagline: 'We lift things'
			}
		]);
		expect(m.one('[data-testid="team-edit-note"]').textContent?.trim()).toBe(
			'Renamed Torque Squad to Gear Heads.'
		);
	});
});

describe('a draw changed by hand says so', () => {
	it('shows Edited by hand when edited_at is set, beside the seed line it qualifies', async () => {
		const m = await openTeams(fake({ set: draw({ edited_at: '2026-09-28T16:00:00.000Z' }) }));
		expect(m.one('[data-testid="team-edited"]').textContent).toContain('Edited by hand');
		expect(m.one('.team-seed').textContent).toContain('seed 4242');
	});

	it('shows nothing for a draw exactly as its seed dealt it', async () => {
		const m = await openTeams(fake());
		expect(m.all('[data-testid="team-edited"]').length).toBe(0);
		expect(m.all('[data-testid="team-card"]').length).toBe(2);
	});
});
