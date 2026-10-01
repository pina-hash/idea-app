// tests/identity-consumer-inheritance.test.ts
//
// THE CLAIM THIS WHOLE BUNDLE RESTS ON, PUT TO CONSUMERS IT DID NOT EDIT.
//
// Report 15 asks for a person's customization to appear "anywhere the profile
// shows up - authoring, publisher, leaderboard, my class". Ledger 0289's hard
// boundary is that it may not edit a single identity consumer -- three of them
// belong to other live lanes -- so the only way to answer that report at all is
// for the identity to render INSIDE `Avatar.svelte`, which every one of those
// surfaces already mounts. That is a claim, and an unverified claim of this
// shape fails silently: the surfaces keep rendering plain identities, which is
// also exactly what "nobody has customized anything yet" looks like.
//
// SO THE TEST IS BOTH DIRECTIONS ON THE REAL COMPONENTS. Every consumer mounted
// below is handed a payload whose rows carry the six 0220 columns, and the
// accent has to come out the other side. (That 0289 left these consumers
// untouched was true when it reported and is recorded in
// `docs/history/new-session-zsum4t.md`; a git-diff assertion of it could only
// ever pass on 0289's own branch, so it was removed.) The negative control is the identical
// payload with the columns ABSENT -- which is the pre-0220 RPC shape and the
// state every deployment is in today -- where the accent must not appear.
//
// WHAT THIS DOES NOT CLAIM, AND THE DISTINCTION IS THE WHOLE OF THE DEFERRAL:
// that any RPC projects those columns today. None does. `classroom_section_roster`
// and `notebook_get_section_grid` would each need a migration in their own
// subsystem's lane, which this bundle may not write. What is proved here is
// that the CLIENT half is finished, so that migration is a `select` widening
// and nothing else -- exactly the position 0179 and 0180 left the avatar
// columns in, on six surfaces that were read-only to the bundle that did it.
//
// SERVER RENDER, deliberately: these are structural claims about which nodes
// exist. No geometry is asserted -- the `node` project has no layout engine at
// all, so a box read here would be vacuous.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SectionGrid from '$lib/notebook/SectionGrid.svelte';
import PeoplePanel from '$lib/classroom/PeoplePanel.svelte';
import Avatar from '$lib/Avatar.svelte';
import IdentityBanner from '$lib/IdentityBanner.svelte';
import { rosterSubject, gridStudentSubject, subjectStyle } from '$lib/avatars';
import type { SectionGrid as SectionGridData } from '$lib/notebook-review';

/** The accent a styled row carries, and a colour nothing else on the page uses. */
const ACCENT = '#8e5bf0';

/** The six columns as a widened RPC payload would carry them. */
const STYLE = {
	style_background_type: 'gradient' as const,
	style_background_value: ['#3e7bfa', '#8e5bf0'] as [string, string],
	style_accent_color: ACCENT,
	style_badge: 'rocket',
	style_flourish: 'glow-pulse',
	style_tagline: 'Builds things that roll'
};

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

// ---------------------------------------------------------------------------
// SectionGrid -- the notebook check-in grid's row header.
// ---------------------------------------------------------------------------

function gridPayload(styled: boolean): SectionGridData {
	const s = styled ? STYLE : {};
	return {
		section: {
			id: 's1',
			course_code: 'IDEA209H',
			course_title: 'Engineering I Honors',
			label: 'Period 1',
			block: 'C',
			teacher_email: 'teacher@boscotech.edu',
			manages: true
		},
		unit_number: 3,
		generated_at: '2026-09-05T12:00:00Z',
		sessions: [
			{ id: 'k1', unit_number: 3, session_date: '2026-09-04', session_label: 'Bearing teardown' }
		],
		students: [
			{
				student_key: 'alice@boscotech.net',
				id: 'u-alice',
				name: 'Alice Alvarez',
				email: 'alice@boscotech.net',
				enrolled: true,
				free_entries: 0,
				avatar: 'preset:hex',
				avatar_url: null,
				...s
			},
			{
				// NEVER CUSTOMIZED, on the same render: the styled row must not
				// paint this one, which is what a badly-keyed derivation would do.
				student_key: 'bruno@boscotech.net',
				id: 'u-bruno',
				name: 'Bruno Barros',
				email: 'bruno@boscotech.net',
				enrolled: true,
				free_entries: 0,
				avatar: null,
				avatar_url: null
			}
		],
		cells: []
	} as unknown as SectionGridData;
}

describe('SectionGrid inherits an identity accent with no edit to it', () => {
	const styled = strip(render(SectionGrid, { props: { grid: gridPayload(true), onOpen: () => {} } }).body);
	const plain = strip(render(SectionGrid, { props: { grid: gridPayload(false), onOpen: () => {} } }).body);

	it('paints the accent when the row carries the columns', () => {
		expect(styled).toContain(ACCENT);
	});

	it('paints NOTHING when the row does not -- the pre-0220 shape', () => {
		expect(plain).not.toContain(ACCENT);
		expect(plain).not.toContain('--avatar-accent');
	});

	it('renders both rows either way, so nobody is dropped for want of a style', () => {
		for (const html of [styled, plain]) {
			expect(html).toContain('Alice Alvarez');
			expect(html).toContain('Bruno Barros');
		}
	});

	it('accents only the row that carries one', () => {
		/* One accent on a two-student render. A derivation keyed on the wrong
		   thing paints both, which reads as working. */
		expect(styled.split(ACCENT).length - 1).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// PeoplePanel -- the classroom roster row.
// ---------------------------------------------------------------------------

function roster(styled: boolean) {
	const s = styled ? STYLE : {};
	return [
		{
			student_email: 'alice@boscotech.net',
			display_name: 'Alice Alvarez',
			active: true,
			avatar: 'preset:hex',
			avatar_url: null,
			...s
		},
		{
			student_email: 'bruno@boscotech.net',
			display_name: 'Bruno Barros',
			active: true,
			avatar: null,
			avatar_url: null
		}
	];
}

function renderPeople(styled: boolean): string {
	return strip(
		render(PeoplePanel, {
			props: {
				section: {
					id: 's1',
					course_code: 'IDEA209H',
					course_title: 'Engineering I Honors',
					label: 'Period 1',
					block: 'C',
					teacher_email: 'teacher@boscotech.edu'
				},
				roster: roster(styled),
				transports: {}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any
		}).body
	);
}

describe('PeoplePanel paints a roster row\'s identity accent, and nothing on the pre-0220 shape', () => {
	const styled = renderPeople(true);
	const plain = renderPeople(false);

	it('paints the accent when the roster row carries the columns', () => {
		expect(styled).toContain(ACCENT);
	});

	it('paints NOTHING on the pre-0220 roster shape', () => {
		expect(plain).not.toContain(ACCENT);
	});

	it('renders both people either way', () => {
		for (const html of [styled, plain]) {
			expect(html).toContain('Alice Alvarez');
			expect(html).toContain('Bruno Barros');
		}
	});
});

// ---------------------------------------------------------------------------
// The adapters, which are what carry the columns onto a subject at all.
// ---------------------------------------------------------------------------

describe('the adapters carry the six columns, and preserve absence', () => {
	it('rosterSubject carries them across', () => {
		const s = subjectStyle(rosterSubject({ student_email: 'a@b.c', ...STYLE }));
		expect(s?.accent_color).toBe(ACCENT);
		expect(s?.badge).toBe('rocket');
		expect(s?.tagline).toBe('Builds things that roll');
		expect(s?.background_value).toEqual(['#3e7bfa', '#8e5bf0']);
	});

	it('gridStudentSubject carries them across', () => {
		const s = subjectStyle(gridStudentSubject({ name: 'A', email: 'a@b.c', ...STYLE }));
		expect(s?.accent_color).toBe(ACCENT);
	});

	it('answers NULL for a row with none, which is every row today', () => {
		expect(subjectStyle(rosterSubject({ student_email: 'a@b.c' }))).toBeNull();
		expect(subjectStyle(gridStudentSubject({ name: 'A', email: 'a@b.c' }))).toBeNull();
	});

	/* UNDEFINED IS PRESERVED RATHER THAN FLATTENED TO NULL. A pre-0220 payload
	   omits the keys; a customized-nothing payload carries them as null. Both
	   render identically, so this matters only where a CONTROL is offered --
	   but flattening here would take the distinction away from the one surface
	   that needs it before it could ever ask. */
	it('preserves undefined, so "not applied" stays distinguishable from "chose nothing"', () => {
		const absent = rosterSubject({ student_email: 'a@b.c' });
		const chosen = rosterSubject({ student_email: 'a@b.c', style_accent_color: null });
		expect(absent.style_accent_color).toBeUndefined();
		expect(chosen.style_accent_color).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// The restraint, asserted as the difference between the two components.
// ---------------------------------------------------------------------------

describe('the restraint: an avatar takes the accent and nothing else', () => {
	const subject = { display_name: 'Alice Alvarez', email: 'alice@boscotech.net', ...STYLE };
	const avatar = strip(render(Avatar, { props: { subject, size: 24 } }).body);
	const banner = strip(render(IdentityBanner, { props: { subject, size: 44 } }).body);

	it('the avatar paints the accent', () => {
		expect(avatar).toContain(ACCENT);
	});

	it('and NOT the background, the badge or the tagline', () => {
		/* The three things a roster of thirty must not pay for. The gradient's
		   other stop is the tell for the background; the tagline is its own
		   words. */
		expect(avatar).not.toContain('#3e7bfa');
		expect(avatar).not.toContain('linear-gradient');
		expect(avatar).not.toContain('Builds things that roll');
	});

	it('the banner paints all three -- the positive control for the four absences above', () => {
		expect(banner).toContain(ACCENT);
		expect(banner).toContain('linear-gradient');
		expect(banner).toContain('Builds things that roll');
		/* The badge glyph: `rocket`'s own path, from the shared registry. */
		expect(banner).toContain('M12 2.6c3.3 2.3 5.2 5.8 5.2 9.6');
	});

	it('and a person with NO style gets a banner with no card at all', () => {
		const bare = strip(
			render(IdentityBanner, { props: { subject: { display_name: 'Bruno Barros' } } }).body
		);
		expect(bare).toContain('Bruno Barros');
		expect(bare).not.toContain('styled');
	});

	/* THE DISCLOSURE RULE, ASSERTED: `displayName()`'s third rung is the email
	   address, which on a surface every signed-in student can read is a
	   disclosure -- the reason CLAUDE.md forbids that function on every Foundry
	   surface. A SUBJECT with no name must fall back to nothing, never to the
	   address. The profile arm is the positive control: the viewer's own row
	   may show the viewer their own address, which is what ProfileMenu has
	   always done. */
	it('never renders a subjects email address as their name', () => {
		const nameless = strip(
			render(IdentityBanner, { props: { subject: { email: 'alice@boscotech.net' } } }).body
		);
		expect(nameless).not.toContain('alice@boscotech.net');

		const own = strip(
			render(IdentityBanner, {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				props: { profile: { id: 'u1', email: 'alice@boscotech.net' } as any }
			}).body
		);
		expect(own, 'the viewers own row is the control').toContain('alice@boscotech.net');
	});
});
