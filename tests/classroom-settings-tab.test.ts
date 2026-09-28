import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { load } from '../src/routes/classroom/[sectionId]/settings/+page.server';
import ClassSettingsPanel from '../src/lib/classroom/ClassSettingsPanel.svelte';
import PeoplePanel from '../src/lib/classroom/PeoplePanel.svelte';
import { classSettingsHref, sectionTabs, splitArchived, visibleSectionTabs } from '../src/lib/classroom/nav';

/**
 * THE CLASS'S OWN SETTINGS TAB (report R06, 2026-09-28) AND THE ARCHIVED SPLIT
 * (report R12).
 *
 * Three guarantees here would regress SILENTLY, which is why they are tests:
 *
 *   1. THE TAB IS NOT THE GATE. A student is offered no Settings tab
 *      (`tests/classroom-nav-doors.test.ts` holds that half), and the failure
 *      that matters is the other one: a later bundle reading the tab filter as
 *      the access decision and relaxing the page, so a typed URL answers. The
 *      REAL load is driven here with the manage answer under the test's
 *      control, and it must 404 -- never 403, never a redirect -- exactly as
 *      People, Grades and Duplicates do.
 *   2. THE CONTROLS MOVED, THEY WERE NOT COPIED. Edit details, Archive class
 *      and Delete class are ClassSettingsPanel's and nobody else's; a People
 *      tab that grew them back would be two sets of handlers for one class.
 *   3. THE CLASS ON SCREEN KEEPS ITS STRIP KEY WHEN IT IS ARCHIVED. The header
 *      strip draws active classes only, so without `keep` a teacher standing
 *      on an archived class's page loses the key of the page they are on, and
 *      nothing on screen reports it.
 */

type Row = Record<string, unknown> | null;

function client(opts: { manages: boolean; row: Row }) {
	return {
		from: () => ({
			select: () => ({
				eq: () => ({ maybeSingle: async () => ({ data: opts.row }) })
			})
		}),
		rpc: async (fn: string) => {
			if (fn === 'classroom_manages_section') return { data: opts.manages, error: null };
			return { data: null, error: null };
		}
	};
}

const SECTION_ROW = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 1',
	block: 'A',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	classroom_courses: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

const run = (manages: boolean, row: Row = SECTION_ROW, claims: unknown = { sub: 'u-1' }) =>
	(load as never as (event: unknown) => unknown)({
		params: { sectionId: 's-1' },
		locals: { supabase: client({ manages, row }), claims }
	});

describe('the Settings tab is refused by its own page, not by the tab bar', () => {
	it('a non-manager is offered no Settings tab', () => {
		const student = visibleSectionTabs(sectionTabs('s-1'), false);
		expect(student.some((t) => t.id === 'settings')).toBe(false);
		// POSITIVE CONTROL: the tab exists and a manager is offered it, pointing
		// at the one spelling of the address.
		const manager = visibleSectionTabs(sectionTabs('s-1'), true);
		expect(manager.find((t) => t.id === 'settings')?.href).toBe(classSettingsHref('s-1'));
		expect(classSettingsHref('s-1')).toBe('/classroom/s-1/settings');
	});

	it('a non-manager who can read the class gets 404, not 403 and not a redirect', async () => {
		await expect(run(false)).rejects.toMatchObject({ status: 404 });
	});

	it('a class the caller cannot read answers identically, even with a manage answer', async () => {
		await expect(run(true, null)).rejects.toMatchObject({ status: 404 });
	});

	it('POSITIVE CONTROL: a manager driving the same URL is served the class', async () => {
		const answer = (await run(true)) as { section: { id: string; active?: boolean }; canManage: boolean };
		expect(answer.section.id).toBe('s-1');
		expect(answer.section.active).toBe(true);
		expect(answer.canManage).toBe(true);
	});
});

function renderSettings(active: boolean): string {
	return render(ClassSettingsPanel, {
		props: {
			section: {
				id: 's1',
				course_id: 'c1',
				label: 'Period 1',
				block: 'A',
				teacher_email: 'vargas@boscotech.edu',
				active,
				course: { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
			},
			transports: {}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any
	}).body;
}

function renderPeople(): string {
	return render(PeoplePanel, {
		props: {
			section: {
				id: 's1',
				course_id: 'c1',
				label: 'Period 1',
				block: 'A',
				teacher_email: 'vargas@boscotech.edu',
				active: true,
				course: { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
			},
			roster: [],
			transports: {}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any
	}).body;
}

const CONTROLS = ['settings-edit-details', 'settings-archive', 'settings-delete'];
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('the class settings moved to their own panel, and People no longer carries them', () => {
	const settings = renderSettings(true);
	const people = renderPeople();

	it('the Settings panel carries each control exactly once', () => {
		for (const id of CONTROLS) expect(count(settings, `data-testid="${id}"`), id).toBe(1);
		expect(settings).toContain('Edit details');
		expect(settings).toContain('Archive class');
		expect(settings).toContain('Delete class');
	});

	it('People carries none of them, and says where they went', () => {
		for (const id of CONTROLS) expect(count(people, `data-testid="${id}"`), id).toBe(0);
		// The old card's own words, as controls: none survive on People.
		expect(people).not.toContain('Save class');
		expect(people).not.toContain('Reactivate class');
		expect(people).not.toContain('Cancel delete');
		// POSITIVE CONTROL that People rendered at all, and the pointer to the tab.
		expect(people).toContain('data-testid="class-tools"');
		expect(count(people, 'data-testid="people-settings-moved"')).toBe(1);
		expect(people).toContain('href="/classroom/s1/settings"');
	});

	it('an archived class offers Reactivate, and says it is archived', () => {
		const archived = renderSettings(false);
		expect(archived).toContain('Reactivate class');
		expect(archived).not.toContain('Archive class</');
		expect(count(archived, 'data-testid="settings-archived-chip"')).toBe(1);
		// And an active one does not wear the chip.
		expect(count(settings, 'data-testid="settings-archived-chip"')).toBe(0);
	});
});

describe('splitArchived: one definition of archived for My Classes and the strip', () => {
	const rows = [
		{ id: 'a', active: true },
		{ id: 'b', active: false },
		{ id: 'c' },
		{ id: 'd', active: false },
		{ id: 'e', active: true }
	];

	it('active first in the order given, archived apart, absent `active` reads as active', () => {
		const { active, archived } = splitArchived(rows);
		expect(active.map((r) => r.id)).toEqual(['a', 'c', 'e']);
		expect(archived.map((r) => r.id)).toEqual(['b', 'd']);
	});

	it('the class on screen keeps its strip key when it is archived, and is still listed as archived', () => {
		const { active, archived } = splitArchived(rows, 'd');
		expect(active.map((r) => r.id)).toEqual(['a', 'c', 'd', 'e']);
		expect(archived.map((r) => r.id)).toEqual(['b', 'd']);
	});

	it('keeping an active class, or nothing, changes nothing', () => {
		expect(splitArchived(rows, 'a')).toEqual(splitArchived(rows));
		expect(splitArchived(rows, null)).toEqual(splitArchived(rows));
		expect(splitArchived(rows, 'no-such-class')).toEqual(splitArchived(rows));
	});
});
