// tests/classroom-team-style.test.ts
//
// STUDENTS CUSTOMIZE THEIR OWN TEAM FROM THE CLASS PAGE (ledger 0360, report
// R17). 0223 built the membership-gated write, `classroom_set_team_style`, and
// no screen ever offered it to a student: the class page drew a team card with
// no control and no badge, and the People tab told the teacher "You can change
// this team's name and colours" beside a Rename and no colour control at all.
//
// WHY A TEST, AND WHICH HALVES. Two of these regressions are SILENT:
//   * the RPC REPLACES all seven columns it writes and a null clears, so an
//     input that dropped a field would wipe it on the next save with nothing
//     on screen to say so (the People tab's Rename already carries the style
//     over for exactly this reason). `teamStyleInputOf` carrying every field,
//     the flourish from the STORED row, is pinned here.
//   * the background hex is checked by 0223 WITHOUT `lower()`, so an
//     uppercase colour reaching it is a refusal the student never caused.
// The control's presence is asserted in BOTH directions on the real
// component's server render, with counts: present for a student on the team
// and for a teacher's board, absent with no transport, for a student on no
// team, and for a student's view of the board. The DB half (the membership
// gate itself) is tests/db/classroom-teams.test.ts and is unchanged.
//
// EXPECTED VALUES ARE FIXTURES: the sentences are 0223's own (read from the
// migration file, not retyped), and the colours are ones no default produces.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ClassTeams from '../src/lib/classroom/ClassTeams.svelte';
import {
	TEAM_NAME_MAX,
	TEAM_TAGLINE_MAX,
	clearedTeamLook,
	draftTeam,
	teamStyleChanged,
	teamStyleDraftOf,
	teamStyleDraftProblems,
	teamStyleInputOf,
	type SaveTeamStyleInput,
	type TeamStyleDraft
} from '../src/lib/classroom/teams';
import { withSavedStyle, type ClassTeam, type ClassTeamSet } from '../src/lib/classroom/class-teams';

const MIGRATION = readFileSync(new URL('../supabase/migrations/0223_classroom_teams.sql', import.meta.url), 'utf8');

const STORED: ClassTeam = {
	id: 't-1',
	team_number: 1,
	name: 'Torque Squad',
	accent_color: '#3fb0a0',
	background_type: 'gradient',
	background_value: ['#12352f', '#1d5a4f'],
	badge: 'gear',
	// The one field the editor does not offer: no team card draws a flourish.
	flourish: 'glow-pulse',
	tagline: 'Measure twice',
	mine: true,
	members: ['Ana Reyes', 'Ben Okafor']
};

function setOf(teams: ClassTeam[], over: Partial<ClassTeamSet> = {}): ClassTeamSet {
	return {
		id: 'set-1',
		label: 'Lab pairs',
		posted_at: '2026-09-25T15:00:00.000Z',
		visible_until: null,
		edited: false,
		teams,
		...over
	};
}
const plain = (id: string, n: number, mine = false): ClassTeam => ({
	id,
	team_number: n,
	name: null,
	accent_color: null,
	background_type: null,
	background_value: null,
	badge: null,
	flourish: null,
	tagline: null,
	mine,
	members: [`Member ${n}`]
});

describe('the save input carries all seven columns the RPC replaces', () => {
	it('an untouched draft sends back exactly the stored look, flourish included', () => {
		const input = teamStyleInputOf(STORED.id, teamStyleDraftOf(STORED), STORED);
		expect(input).toEqual({
			teamId: 't-1',
			name: 'Torque Squad',
			accentColor: '#3fb0a0',
			backgroundType: 'gradient',
			backgroundValue: ['#12352f', '#1d5a4f'],
			badge: 'gear',
			flourish: 'glow-pulse',
			tagline: 'Measure twice'
		});
		// Every key the RPC takes, and nothing else: `p_team_id` plus the seven.
		const rpcParams = [...MIGRATION.matchAll(/^\s+p_([a-z_]+) (?:uuid|text|jsonb)/gm)]
			.map((m) => m[1])
			.filter((_, i, all) => all.indexOf(_) === i);
		expect(rpcParams).toEqual(
			expect.arrayContaining(['team_id', 'name', 'accent_color', 'background_type', 'background_value', 'badge', 'flourish', 'tagline'])
		);
		expect(Object.keys(input).sort()).toEqual(
			['teamId', 'name', 'accentColor', 'backgroundType', 'backgroundValue', 'badge', 'flourish', 'tagline'].sort()
		);
	});

	it('a blank name and motto become null, which 0223 stores as not set', () => {
		const draft: TeamStyleDraft = { ...teamStyleDraftOf(STORED), name: '   ', tagline: '\t' };
		const input = teamStyleInputOf(STORED.id, draft, STORED);
		expect(input.name).toBeNull();
		expect(input.tagline).toBeNull();
		// Positive control: text with content is trimmed and kept.
		expect(teamStyleInputOf(STORED.id, { ...draft, name: '  Gear Heads ' }, STORED).name).toBe('Gear Heads');
	});

	it('every hex is lowercased, because 0223 checks the background without lower()', () => {
		// The migration really does check the background unlowered: if this ever
		// stops matching, the reason for the lowercasing is gone too.
		expect(MIGRATION).toMatch(/\(v_bg #>> '\{\}'\) !~ '\^#\[0-9a-f\]\{6\}'/);
		const draft: TeamStyleDraft = {
			...teamStyleDraftOf(STORED),
			accent: '#AB12CD',
			bg: 'gradient',
			gradA: '#A0B0C0',
			gradB: '#FFEEDD'
		};
		const input = teamStyleInputOf(STORED.id, draft, STORED);
		expect(input.accentColor).toBe('#ab12cd');
		expect(input.backgroundValue).toEqual(['#a0b0c0', '#ffeedd']);
		const solid = teamStyleInputOf(STORED.id, { ...draft, bg: 'solid', solid: '#ABCDEF' }, STORED);
		expect([solid.backgroundType, solid.backgroundValue]).toEqual(['solid', '#abcdef']);
	});

	it('the background type and value travel together, and None clears both', () => {
		const none = teamStyleInputOf(STORED.id, { ...teamStyleDraftOf(STORED), bg: 'none' }, STORED);
		expect([none.backgroundType, none.backgroundValue]).toEqual([null, null]);
		// An invalid well is dropped rather than sent half-formed (the problem
		// list is what tells the person).
		const broken = teamStyleInputOf(STORED.id, { ...teamStyleDraftOf(STORED), bg: 'solid', solid: 'teal' }, STORED);
		expect([broken.backgroundType, broken.backgroundValue]).toEqual([null, null]);
	});

	it('the flourish comes from the STORED row, never from the draft, which has none', () => {
		const input = teamStyleInputOf(STORED.id, clearedTeamLook(teamStyleDraftOf(STORED)), STORED);
		expect(input.flourish).toBe('glow-pulse');
		expect(teamStyleInputOf('t-2', teamStyleDraftOf(plain('t-2', 2)), plain('t-2', 2)).flourish).toBeNull();
	});

	it('Clear look clears the colour, background, badge and motto and keeps the name', () => {
		const input = teamStyleInputOf(STORED.id, clearedTeamLook(teamStyleDraftOf(STORED)), STORED);
		expect(input).toMatchObject({
			name: 'Torque Squad',
			accentColor: null,
			backgroundType: null,
			backgroundValue: null,
			badge: null,
			tagline: null
		});
	});
});

describe('a draft is refused in the sentences 0223 uses, before it is sent', () => {
	it('each sentence is the RPC\'s own, read from the migration', () => {
		const draft = teamStyleDraftOf(STORED);
		expect(teamStyleDraftProblems(draft)).toEqual([]);
		const accent = teamStyleDraftProblems({ ...draft, accent: 'red' });
		const solid = teamStyleDraftProblems({ ...draft, bg: 'solid', solid: '#12' });
		const gradient = teamStyleDraftProblems({ ...draft, bg: 'gradient', gradB: 'blue' });
		for (const [got] of [accent, solid, gradient]) expect(MIGRATION).toContain(`raise exception '${got}'`);
		expect(accent).toHaveLength(1);
		expect(solid).toHaveLength(1);
		expect(gradient).toHaveLength(1);
	});

	it('the lengths are the table CHECKs, which the RPC does not pre-check', () => {
		expect(MIGRATION).toMatch(new RegExp(`char_length\\(btrim\\(name\\)\\) between 1 and ${TEAM_NAME_MAX}`));
		expect(MIGRATION).toMatch(new RegExp(`char_length\\(btrim\\(tagline\\)\\) between 1 and ${TEAM_TAGLINE_MAX}`));
		const draft = teamStyleDraftOf(STORED);
		expect(teamStyleDraftProblems({ ...draft, name: 'x'.repeat(TEAM_NAME_MAX) })).toEqual([]);
		expect(teamStyleDraftProblems({ ...draft, name: 'x'.repeat(TEAM_NAME_MAX + 1) })).toHaveLength(1);
		expect(teamStyleDraftProblems({ ...draft, tagline: 'y'.repeat(TEAM_TAGLINE_MAX + 1) })).toHaveLength(1);
	});
});

describe('Save asks the diff, not whether there is a look', () => {
	it('an untouched draft is unchanged; one moved field is a change; trimming and case are not', () => {
		const draft = teamStyleDraftOf(STORED);
		expect(teamStyleChanged(STORED, draft)).toBe(false);
		expect(teamStyleChanged(STORED, { ...draft, badge: 'star' })).toBe(true);
		expect(teamStyleChanged(STORED, { ...draft, name: ' Torque Squad ' })).toBe(false);
		expect(teamStyleChanged(STORED, { ...draft, accent: '#3FB0A0' })).toBe(false);
	});
});

describe('the class page overlays a save onto every render of that team', () => {
	it('the saved fields land on the matching team only, in every set', () => {
		const sets = [setOf([STORED, plain('t-2', 2)]), setOf([plain('t-9', 1)], { id: 'set-2' })];
		const input: SaveTeamStyleInput = {
			teamId: 't-2',
			name: 'Rivet Crew',
			accentColor: '#ab12cd',
			backgroundType: 'solid',
			backgroundValue: '#a5b478',
			badge: 'bolt',
			flourish: null,
			tagline: 'Hold fast'
		};
		const next = withSavedStyle(sets, input);
		expect(next[0].teams[1]).toMatchObject({ name: 'Rivet Crew', badge: 'bolt', background_value: '#a5b478', members: ['Member 2'] });
		// Untouched: the other team of the draw and the other draw entirely.
		expect(next[0].teams[0]).toBe(sets[0].teams[0]);
		expect(next[1]).toBe(sets[1]);
	});

	it('the live preview is the draft through the same normalization a save sends', () => {
		const preview = draftTeam(STORED, { ...teamStyleDraftOf(STORED), name: '  ', accent: '#ABCDEF' });
		expect(preview.name).toBeNull();
		expect(preview.accent_color).toBe('#abcdef');
		expect(preview.members).toEqual(STORED.members);
	});
});

/* -------------------------------------------------------------------------
 * THE REAL COMPONENT, SERVER-RENDERED, COUNTED BOTH WAYS.
 * ---------------------------------------------------------------------- */

const style = async () => ({ ok: true });
function html(props: Record<string, unknown>): string {
	return render(ClassTeams as never, { props: props as never }).body;
}
const count = (body: string, testid: string) => (body.match(new RegExp(`data-testid="${testid}"`, 'g')) ?? []).length;
const TEACHER = { href: '/classroom/s-1/people', label: 'People' };

describe('the class page offers the control to exactly the people the RPC admits', () => {
	const sets = [setOf([STORED, plain('t-2', 2), plain('t-3', 3), plain('t-4', 4)])];

	it('a student on the team gets one Customize team; nobody else on the page does', () => {
		const body = html({ sets, style });
		expect(count(body, 'class-team-mine')).toBe(1);
		expect(count(body, 'class-team-customize')).toBe(1);
		expect(count(body, 'class-team-edit-look')).toBe(0);
		// The board's own four cards are there (positive control) with no control on them.
		expect(count(body, 'class-team')).toBe(4);
	});

	it('no transport removes every control, with the cards still drawn', () => {
		const body = html({ sets });
		expect(count(body, 'class-team-mine')).toBe(1);
		expect(count(body, 'class-team')).toBe(4);
		expect(count(body, 'class-team-customize')).toBe(0);
		expect(count(body, 'class-team-edit-look')).toBe(0);
		expect(count(body, 'class-team-saved')).toBe(0);
	});

	it('a student on no team of the draw gets no control', () => {
		const notMine = [setOf([{ ...STORED, mine: false }, plain('t-2', 2)])];
		const body = html({ sets: notMine, style });
		expect(count(body, 'class-team-mine')).toBe(0);
		expect(count(body, 'class-team')).toBe(2);
		expect(count(body, 'class-team-customize')).toBe(0);
		expect(count(body, 'class-team-edit-look')).toBe(0);
	});

	it('a teacher gets Edit look on every board card, and no Customize team', () => {
		const teacherSets = [setOf([{ ...STORED, mine: false }, plain('t-2', 2), plain('t-3', 3), plain('t-4', 4)])];
		const body = html({ sets: teacherSets, manage: TEACHER, style });
		expect(count(body, 'class-team-edit-look')).toBe(4);
		expect(count(body, 'class-team-customize')).toBe(0);
		// Positive control for the teacher half: the strip renders.
		expect(count(body, 'class-teams-posted')).toBe(1);
	});

	it('the badge is drawn when a team has one, and not otherwise', () => {
		const body = html({ sets, style });
		// STORED (gear) on the own card and on its board card; the three plain teams have none.
		expect(count(body, 'class-team-badge')).toBe(2);
		const none = html({ sets: [setOf([plain('t-2', 2, true)])], style });
		expect(count(none, 'class-team-badge')).toBe(0);
	});

	it('the colours are a wash class, never a full-strength fill under the text', () => {
		const body = html({ sets, style });
		expect((body.match(/class="ct-card[^"]*\bhas-bg\b/g) ?? []).length).toBe(2);
		const src = readFileSync(new URL('../src/lib/classroom/ClassTeams.svelte', import.meta.url), 'utf8');
		// The fill that put a name at 1.90:1 is gone, and the wash is the layer.
		expect(src).not.toMatch(/background:\s*var\(--team-bg,\s*var\(--surface-1\)\)/);
		expect(src).toMatch(/\.ct-card\.has-bg::before\s*\{[^}]*background:\s*var\(--team-bg\);[^}]*opacity:\s*0\.22/);
		expect(src).not.toMatch(/var\(--team-ink/);
	});
});

describe('the People tab tells the teacher the truth about who styles a team', () => {
	const panel = readFileSync(new URL('../src/lib/classroom/PeoplePanel.svelte', import.meta.url), 'utf8');
	it('the false hint is gone and the true one is there', () => {
		expect(panel).not.toContain("You can change this team's name and colours.");
		expect(panel).toContain('Students on this team can change its name, colours and badge from the class page');
		// Positive control: the hint still renders under the same gate it had.
		expect(panel).toMatch(/canStyleTeam\(team, teamsManages\) && teamTransports\.style/);
	});
	it('its card uses the same wash and draws the badge', () => {
		expect(panel).toMatch(/\.team-card\.has-bg::before\s*\{[^}]*opacity:\s*0\.22/);
		expect(panel).toContain('data-testid="team-card-badge"');
		expect(panel).not.toMatch(/background:\s*var\(--team-bg,\s*transparent\)/);
	});
});
