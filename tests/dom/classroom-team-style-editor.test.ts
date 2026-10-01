// tests/dom/classroom-team-style-editor.test.ts
//
// A STUDENT CUSTOMIZES THEIR TEAM ON THE CLASS PAGE, ON THE REAL COMPONENT
// (ledger 0360, report R17). Mounts the REAL `ClassTeams` with a fake style
// transport and drives the real `TeamStyleEditor` inside it: open, rename,
// choose a gradient and a badge, Save.
//
// WHY A MOUNT AND NOT ONLY A HARNESS. The parts that regress silently are the
// ones a person checking by eye cannot see: how many writes one Save makes,
// whether the write carried the field the editor does not offer (a dropped
// flourish is a wipe on the next save), whether a refusal kept the draft, and
// whether the poller was asked for exactly ONE re-read rather than a new
// cadence. Effects only run in this project, so this is where those are real.
//
// Structure, events and call counts only; happy-dom lays nothing out. The 44px
// targets, the wash's contrast and the 375px fit are
// tools/browser-verify/routes/classroom-teams-style-1*.mjs and classroom-teams-styled-extremes.mjs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import ClassTeams from '../../src/lib/classroom/ClassTeams.svelte';
import type { ClassTeam, ClassTeamSet } from '../../src/lib/classroom/class-teams';
import type { SaveTeamStyleInput, TeamStyleResult } from '../../src/lib/classroom/teams';
import { mountInto, typeAt, type Mounted } from './mount';

const MINE: ClassTeam = {
	id: 't-1',
	team_number: 1,
	name: 'Torque Squad',
	accent_color: null,
	background_type: null,
	background_value: null,
	badge: null,
	flourish: 'glow-pulse',
	tagline: null,
	mine: true,
	members: ['Ana Reyes', 'Ben Okafor']
};
const OTHER: ClassTeam = { ...MINE, id: 't-2', team_number: 2, name: null, flourish: null, mine: false, members: ['Dee Marsh'] };
const SETS: ClassTeamSet[] = [
	{ id: 'set-1', label: 'Lab pairs', posted_at: '2026-09-25T15:00:00.000Z', visible_until: null, edited: false, teams: [MINE, OTHER] }
];

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	vi.restoreAllMocks();
});

function mountTeams(props: Record<string, unknown>): Mounted {
	mounted = mountInto(ClassTeams as never, { sets: SETS, ...props });
	return mounted;
}
const ownName = (m: Mounted) => m.one('[data-testid="class-team-mine"] .ct-name-text').textContent?.trim();
const button = (m: Mounted, label: string) => {
	const found = m
		.all<HTMLButtonElement>('[data-testid="team-style-editor"] button')
		.find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === label);
	if (!found) throw new Error(`no editor button "${label}"`);
	return found;
};
async function save(m: Mounted) {
	m.one<HTMLButtonElement>('[data-testid="team-style-save"]').click();
	await m.settle();
}

describe('customizing a team from the class page', () => {
	it('open, rename, gradient, badge, Save: ONE write, all seven fields, the flourish kept, the card updated before any refresh', async () => {
		const calls: SaveTeamStyleInput[] = [];
		const style = vi.fn(async (input: SaveTeamStyleInput): Promise<TeamStyleResult> => {
			calls.push(input);
			return { ok: true };
		});
		// THE RE-READ IS HELD OPEN, so the card can be read while only the
		// overlay could be showing the new look; then it answers the board as the
		// database now holds it, which is what confirms the save.
		let answer: ((v: ClassTeamSet[]) => void) | null = null;
		const refresh = vi.fn(() => new Promise<ClassTeamSet[]>((resolve) => (answer = resolve)));
		const m = mountTeams({ style, refresh });

		expect(m.all('[data-testid="team-style-editor"]')).toHaveLength(0);
		const open = m.one<HTMLButtonElement>('[data-testid="class-team-customize"]');
		expect(open.getAttribute('aria-expanded')).toBe('false');
		open.click();
		m.flush();
		expect(m.all('[data-testid="team-style-editor"]')).toHaveLength(1);
		expect(open.getAttribute('aria-expanded')).toBe('true');
		expect(open.getAttribute('aria-controls')).toBe(m.one('[data-testid="team-style-editor"]').id);

		typeAt(m.one('[data-testid="team-style-name"]'), 'Gear Heads');
		m.flush();
		// THE LIVE PREVIEW: the own card renders the draft while it is being chosen.
		expect(ownName(m)).toBe('Gear Heads');
		button(m, 'Gradient').click();
		button(m, 'Gear').click();
		m.flush();
		expect(button(m, 'Gradient').getAttribute('aria-pressed')).toBe('true');

		await save(m);
		expect(style).toHaveBeenCalledTimes(1);
		expect(calls[0]).toEqual({
			teamId: 't-1',
			name: 'Gear Heads',
			accentColor: null,
			backgroundType: 'gradient',
			backgroundValue: ['#1d5a4f', '#3e7bfa'],
			badge: 'gear',
			flourish: 'glow-pulse',
			tagline: null
		});
		// The editor closed, the card kept the saved look (the overlay), the
		// live region said so, and the existing poller was asked for ONE read.
		expect(m.all('[data-testid="team-style-editor"]')).toHaveLength(0);
		expect(ownName(m)).toBe('Gear Heads');
		expect(m.all('[data-testid="class-team-mine"] [data-testid="class-team-badge"]')).toHaveLength(1);
		expect(m.one('[data-testid="class-team-saved"]').textContent).toBe('Saved. Your class sees the new look.');
		expect(refresh).toHaveBeenCalledTimes(1);
		// The board answers with the saved row; the card keeps it, and nothing
		// further is asked (no new cadence: the next read is the poller's own).
		const savedRow = { ...MINE, name: 'Gear Heads', background_type: 'gradient' as const, background_value: ['#1d5a4f', '#3e7bfa'] as [string, string], badge: 'gear' };
		answer!([{ ...SETS[0], teams: [savedRow, OTHER] }]);
		await m.settle();
		expect(ownName(m)).toBe('Gear Heads');
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('a refusal is shown in the database\'s own words and the draft is kept', async () => {
		const REFUSAL = 'Only a student on this team, or a teacher of the class, can customize it.';
		const style = vi.fn(async (): Promise<TeamStyleResult> => ({ ok: false, retryable: false, message: REFUSAL }));
		const m = mountTeams({ style });
		m.one<HTMLButtonElement>('[data-testid="class-team-customize"]').click();
		m.flush();
		typeAt(m.one('[data-testid="team-style-name"]'), 'Gear Heads');
		m.flush();
		await save(m);
		expect(style).toHaveBeenCalledTimes(1);
		// A refusal is answered ONCE, never retried.
		await m.settle();
		expect(style).toHaveBeenCalledTimes(1);
		expect(m.all('[data-testid="team-style-editor"]')).toHaveLength(1);
		expect(m.one('[data-testid="team-style-editor"]').textContent).toContain(REFUSAL);
		expect(m.one<HTMLInputElement>('[data-testid="team-style-name"]').value).toBe('Gear Heads');
		expect(m.one('[data-testid="class-team-saved"]').textContent).toBe('');
	});

	it('Cancel puts the stored look back on the card and writes nothing', async () => {
		const style = vi.fn(async (): Promise<TeamStyleResult> => ({ ok: true }));
		const m = mountTeams({ style });
		m.one<HTMLButtonElement>('[data-testid="class-team-customize"]').click();
		m.flush();
		typeAt(m.one('[data-testid="team-style-name"]'), 'Something Else');
		m.flush();
		expect(ownName(m)).toBe('Something Else');
		m.one<HTMLButtonElement>('[data-testid="team-style-cancel"]').click();
		m.flush();
		expect(m.all('[data-testid="team-style-editor"]')).toHaveLength(0);
		expect(ownName(m)).toBe('Torque Squad');
		expect(style).toHaveBeenCalledTimes(0);
	});

	it('Save with nothing changed writes nothing and says why', async () => {
		const style = vi.fn(async (): Promise<TeamStyleResult> => ({ ok: true }));
		const m = mountTeams({ style });
		m.one<HTMLButtonElement>('[data-testid="class-team-customize"]').click();
		m.flush();
		const saveBtn = m.one<HTMLButtonElement>('[data-testid="team-style-save"]');
		// aria-disabled, never disabled: the control has to explain itself.
		expect(saveBtn.getAttribute('aria-disabled')).toBe('true');
		expect(saveBtn.disabled).toBe(false);
		await save(m);
		expect(style).toHaveBeenCalledTimes(0);
		expect(m.one('[data-testid="team-style-why"]').textContent).toContain('Nothing has changed yet');
	});

	it('a teacher edits a board card through the same editor, and a student\'s board cards carry no control', async () => {
		const style = vi.fn(async (): Promise<TeamStyleResult> => ({ ok: true }));
		const teacherSets: ClassTeamSet[] = [{ ...SETS[0], teams: [{ ...MINE, mine: false }, OTHER] }];
		const m = mountTeams({ sets: teacherSets, style, manage: { href: '/classroom/s-1/people', label: 'People' } });
		const edits = m.all<HTMLButtonElement>('[data-testid="class-team-edit-look"]');
		expect(edits).toHaveLength(2);
		edits[1].click();
		m.flush();
		expect(m.all('[data-testid="team-style-editor"]')).toHaveLength(1);
		// The teacher's sentence, not the student's.
		expect(m.one('[data-testid="team-style-editor"]').textContent).toContain("this team's name and look");
		button(m, 'Clear look').click();
		typeAt(m.one('[data-testid="team-style-name"]'), 'Team Two');
		m.flush();
		await save(m);
		expect(style).toHaveBeenCalledTimes(1);
		expect((style.mock.calls[0] as unknown as [SaveTeamStyleInput])[0].teamId).toBe('t-2');
	});
});
