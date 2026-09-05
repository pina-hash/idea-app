// tests/avatar-surfaces.test.ts
//
// THE FOUR SURFACES THIS BUNDLE WIRED, ASSERTED AGAINST THE REAL COMPONENTS.
//
// Prompt 0033 put a face on `PeoplePanel`'s roster row and on
// `GradingConsole`'s student identity row, and deliberately left four more:
// `GradingConsole`'s roster LIST, `SectionGrid`, `EntryReview` and
// `ReviewConsole`'s empty-cell panel. This bundle takes those four, and what
// makes that safe is the audience -- every one is refused to anybody who is
// not the section instructor, a section reviewer or an admin, which is proved
// in `tests/db/avatar-notebook-grid.test.ts` against a real Postgres.
//
// WHAT THIS FILE ADDS, which the database test cannot answer:
//
//   1. THE FACE IS ACTUALLY RENDERED. A projection nothing reads is a
//      migration for nothing, and it fails silently -- the surface simply
//      keeps showing tiles, which is also what "chose no picture" looks like.
//      So the assertion is a REAL image for a person who has one, beside a
//      TILE for a person who has not, on the same render.
//   2. NO ROW IS DROPPED OR HELD BACK FOR WANT OF A FACE. Null at any of the
//      three steps the migration names is an ordinary answer.
//   3. THE PRE-MIGRATION SHAPE STILL RENDERS. 0180 is applied BY HAND, so a
//      deployment that has the client and not the migration is a real state:
//      the two keys are simply absent from the RPC's jsonb. That must produce
//      the identical tile, not a hole and not a crash.
//   4. NOTHING BUT THE TWO COLUMNS IS READ. `gridStudentSubject` and
//      `rosterSubject` are the ONLY adapters, and the disclosure is exactly
//      what they name.
//
// SERVER RENDER, deliberately: these are structural claims about which nodes
// exist, and the `node` project is an order of magnitude cheaper than a mount.
// NO GEOMETRY IS ASSERTED HERE -- happy-dom has no layout engine and this
// project has no DOM at all, so a row-height claim would be vacuous. Row
// heights are measured in `tools/browser-verify/routes/avatars.mjs` and
// nowhere else.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SectionGrid from '$lib/notebook/SectionGrid.svelte';
import { gridStudentSubject, rosterSubject, subjectAvatar } from '$lib/avatars';
import type { SectionGrid as SectionGridData } from '$lib/notebook-review';

const PHOTO = 'https://lh3.example/carla.jpg';

/**
 * A grid payload in exactly the shape `notebook_get_section_grid` returns.
 * The four students are the four answers the migration's own header names:
 * a chosen upload, a Google photo, signed in with neither, and on the roster
 * with no account at all.
 */
function gridPayload(opts: { withAvatars: boolean }): SectionGridData {
	const av = (a: string | null, u: string | null) =>
		opts.withAvatars ? { avatar: a, avatar_url: u } : {};
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
				...av('preset:hex', null)
			},
			{
				student_key: 'carla@boscotech.net',
				id: 'u-carla',
				name: 'Carla Cruz',
				email: 'carla@boscotech.net',
				enrolled: true,
				free_entries: 0,
				...av(null, PHOTO)
			},
			{
				student_key: 'bruno@boscotech.net',
				id: 'u-bruno',
				name: 'Bruno Barros',
				email: 'bruno@boscotech.net',
				enrolled: true,
				free_entries: 0,
				...av(null, null)
			},
			{
				// NEVER SIGNED IN: no uuid, so both LEFT joins found nothing.
				student_key: 'dana@boscotech.net',
				id: null,
				name: 'Dana Diaz',
				email: 'dana@boscotech.net',
				enrolled: false,
				free_entries: 0,
				...av(null, null)
			}
		],
		cells: []
	} as unknown as SectionGridData;
}

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

function renderGrid(withAvatars: boolean): string {
	return strip(
		render(SectionGrid, {
			props: { grid: gridPayload({ withAvatars }), onOpen: () => {} }
		}).body
	);
}

describe('SectionGrid: the check-in grid row header', () => {
	const withA = renderGrid(true);
	const without = renderGrid(false);

	it('renders every roster row either way -- nobody is dropped for want of a face', () => {
		for (const html of [withA, without]) {
			for (const name of ['Alice Alvarez', 'Carla Cruz', 'Bruno Barros', 'Dana Diaz']) {
				expect(html).toContain(name);
			}
		}
	});

	it("A REAL PICTURE FOR A PERSON WHO HAS ONE, beside a TILE for one who hasn't", () => {
		// Carla's Google photo is a genuine <img>...
		expect(withA).toContain(PHOTO);
		// ...Alice's chosen preset is the glyph path...
		expect(withA).toContain('<svg');
		// ...and Bruno and Dana are initials tiles on the same render.
		expect(withA).toContain('BB');
		expect(withA).toContain('DD');
	});

	it('AND THE PRE-0180 PAYLOAD RENDERS FOUR TILES, not four holes', () => {
		// The negative control for the assertion above: with the two keys
		// absent, the photo and the preset are gone and every row is a tile.
		expect(without).not.toContain(PHOTO);
		expect(without).not.toContain('<svg');
		expect(without).toContain('AA');
		expect(without).toContain('CC');
		expect(without).toContain('BB');
		expect(without).toContain('DD');
		// Four avatar boxes either way -- the row is the same shape.
		// SVELTE SCOPES THE CLASS, so the attribute is `avatar svelte-<hash>`
		// and an exact-match count answers 0 on a correct render -- which reads
		// exactly like four missing avatars. Matched on the token instead.
		const boxes = (h: string) => (h.match(/class="avatar[ "]/g) ?? []).length;
		expect(boxes(withA)).toBe(4);
		expect(boxes(without)).toBe(4);
	});

	it('the density contract is untouched: the cell box is still 1.9rem', () => {
		// The avatar's whole justification on THIS surface is that it fits
		// under the cell, so the row height does not move. The number is
		// asserted here and the resulting row height is measured in the
		// browser harness.
		const src = readSource('src/lib/notebook/SectionGrid.svelte');
		expect(src).toContain('width: 1.9rem;');
		expect(src).toContain('height: 1.9rem;');
		expect(src).toContain('padding: 0.35rem 0.4rem;');
		// And the avatar is smaller than that box, stated as a literal.
		expect(src).toContain('size={24}');
	});
});

describe('the adapters disclose exactly two columns and no more', () => {
	it('gridStudentSubject reads name/email/avatar/avatar_url and nothing else', () => {
		const subject = gridStudentSubject({
			name: 'Alice Alvarez',
			email: 'alice@boscotech.net',
			avatar: 'preset:hex',
			avatar_url: PHOTO
		});
		expect(subject).toEqual({
			avatar: 'preset:hex',
			avatar_url: PHOTO,
			display_name: 'Alice Alvarez',
			full_name: null,
			email: 'alice@boscotech.net'
		});
	});

	it("the SQL ladder already ran, so the grid's name lands in display_name", () => {
		// `_notebook_section_roster` coalesces display_name -> full_name ->
		// address -> 'Student' in SQL. Re-running a second ladder in the client
		// is how the row header and its tile come to disagree about who this
		// is, so `full_name` is deliberately null here.
		expect(gridStudentSubject({ name: 'Student' }).full_name).toBeNull();
		expect(gridStudentSubject({ name: 'Student' }).display_name).toBe('Student');
	});

	it('AND A PRE-0180 ROW IS THE SAME ANSWER AS "CHOSE NO PICTURE"', () => {
		// This is why there is no capability flag: the two states are
		// indistinguishable on screen, so a flag would report an outage about
		// the state most people are in anyway.
		const absent = gridStudentSubject({ name: 'Bruno Barros', email: 'bruno@boscotech.net' });
		const chosen = gridStudentSubject({
			name: 'Bruno Barros',
			email: 'bruno@boscotech.net',
			avatar: null,
			avatar_url: null
		});
		expect(absent).toEqual(chosen);
		expect(subjectAvatar(absent)).toEqual({ kind: 'initials', text: 'BB' });
	});

	it('the two adapters stay APART -- a grid row is not a roster row', () => {
		// Same person, two payloads, two column spellings. Folding them into
		// one adapter is how one of the two surfaces silently stops finding a
		// name at all.
		expect(rosterSubject({ student_email: 'a@b.net', display_name: 'Ann Bee' }).email).toBe(
			'a@b.net'
		);
		expect(gridStudentSubject({ email: 'a@b.net', name: 'Ann Bee' }).email).toBe('a@b.net');
		// A grid row put through the ROSTER adapter finds nothing, which is
		// exactly the failure this separation prevents.
		expect(
			subjectAvatar(
				rosterSubject({ email: 'a@b.net', name: 'Ann Bee' } as unknown as { student_email?: string })
			)
		).toEqual({ kind: 'initials', text: '?' });
	});
});

// ---------------------------------------------------------------------------
// The three components that cannot be server-rendered cheaply (they want
// transports, a mounted editor and a live entry) are asserted on their SOURCE
// instead, which is the honest thing to say about what this is: a wiring
// check, not a render. Their pixels are measured in the browser harness.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
const readSource = (p: string) => readFileSync(p, 'utf8');

describe('the wiring, on the four surfaces this bundle owns', () => {
	const cases = [
		['src/lib/classroom/GradingConsole.svelte', 'avatarByEmail.get(s.email)', 'size={24}'],
		['src/lib/notebook/SectionGrid.svelte', 'gridStudentSubject(summary.student)', 'size={24}'],
		['src/lib/notebook/EntryReview.svelte', 'gridStudentSubject(student)', 'size={28}'],
		['src/lib/notebook/ReviewConsole.svelte', 'gridStudentSubject(cursorStudent)', 'size={28}']
	] as const;

	it('asserts a real set of cases -- a generated sweep over nothing passes', () => {
		expect(cases.length).toBe(4);
	});

	for (const [file, subjectExpr, size] of cases) {
		it(`${file} mounts the shared Avatar with the shared adapter`, () => {
			const src = readSource(file);
			expect(src).toContain("import Avatar from '$lib/Avatar.svelte';");
			expect(src).toContain(subjectExpr);
			expect(src).toContain(size);
			// NO SECOND IMPLEMENTATION: nothing here re-derives which picture
			// wins or which letters to paint.
			expect(src).not.toContain('avatarUploadUrl(');
			expect(src).not.toContain('AVATAR_PRESETS');
		});
	}

	it('every one of them keys the tint on something DURABLE, never a list index', () => {
		expect(readSource('src/lib/classroom/GradingConsole.svelte')).toContain('tintKey={s.email}');
		expect(readSource('src/lib/notebook/SectionGrid.svelte')).toContain(
			'tintKey={summary.student.student_key}'
		);
		expect(readSource('src/lib/notebook/EntryReview.svelte')).toContain(
			'tintKey={student?.student_key ?? null}'
		);
		expect(readSource('src/lib/notebook/ReviewConsole.svelte')).toContain(
			'tintKey={cursorStudent?.student_key ?? null}'
		);
	});
});
