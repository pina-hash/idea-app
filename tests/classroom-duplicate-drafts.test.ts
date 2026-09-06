// tests/classroom-duplicate-drafts.test.ts
//
// 0074: the surface's own rules, asserted where they are decided.
//
// TWO HALVES, and they answer different questions.
//
//   1. THE PURE LAYER -- the predicate that decides whether a Remove is
//      offered, the sentence that stands in its place when it is not, and the
//      summary line. These come off `DuplicateDrafts.svelte`'s `<script
//      module>` block, which is where they live so that a component in `$lib`
//      needs no second file and no import pointing back into `src/routes`.
//
//   2. A SERVER RENDER of the real component. What is asserted here is
//      STRUCTURE and PRESENCE, never geometry: this project has no layout
//      engine, so a box, a ratio or a 44px target measured here reads zero and
//      passes vacuously. `npm run verify:browser` owns those, at 375 and 1440,
//      and `tools/browser-verify/routes/duplicate-drafts.mjs` is its module.
//
// THE ABSENCE ASSERTIONS EACH CARRY A POSITIVE CONTROL, because a sweep
// reading the wrong attribute comes back clean and clean is what nobody
// investigates. Every "there are no Remove controls" is measured beside the
// same fixture WITH the transport handed in.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import DuplicateDrafts, {
	EMPTY_ANSWER,
	copyIsRemovable,
	groupHeading,
	kindLabel,
	plural,
	readAnswer,
	removalBlockedReason,
	removalCost,
	summaryLine,
	type AttachedCounts,
	type DuplicateAnswer,
	type DuplicateGroup,
	type SurplusCopy
} from '../src/lib/classroom/DuplicateDrafts.svelte';

function counts(over: Partial<AttachedCounts> = {}): AttachedCounts {
	return {
		postings: 1,
		submissions: 0,
		responses: 0,
		approvals: 0,
		files: 0,
		resources: 0,
		specs: 0,
		reference_specs: 0,
		rubrics: 0,
		decks: 0,
		instructor_files: 0,
		instructor_resources: 0,
		instructor_responses: 0,
		instructor_keys: 0,
		...over
	};
}

function copy(over: Partial<SurplusCopy> = {}): SurplusCopy {
	return {
		id: 'c1',
		created_at: '2026-09-04T15:05:00.000Z',
		removable: true,
		student_work: 0,
		authored: 0,
		counts: counts(),
		...over
	};
}

function group(over: Partial<DuplicateGroup> = {}): DuplicateGroup {
	const surplus = over.surplus ?? [copy()];
	return {
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		kind: 'assignment',
		title: 'Bridge lab writeup',
		copies: surplus.length + 1,
		first_written: '2026-09-04T15:02:00.000Z',
		last_written: '2026-09-04T15:06:00.000Z',
		keep_id: 'keep-1',
		surplus_count: surplus.length,
		removable_count: surplus.filter((s) => s.removable).length,
		blocked_count: surplus.filter((s) => !s.removable).length,
		...over,
		surplus
	};
}

function answerOf(groups: DuplicateGroup[]): DuplicateAnswer {
	const surplus = groups.reduce((n, g) => n + g.surplus.length, 0);
	const removable = groups.reduce((n, g) => n + g.surplus.filter((s) => s.removable).length, 0);
	return {
		groups,
		totals: { groups: groups.length, surplus, removable, blocked: surplus - removable }
	};
}

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const countOf = (html: string, re: RegExp) => (strip(html).match(re) ?? []).length;

const ARM = /data-dd-arm/g;
const COPY_ROW = /data-dd-copy/g;
const BLOCKED = /data-dd-blocked/g;
const REASON = /data-dd-reason/g;

// ---------------------------------------------------------------------------
// 1. The pure layer.
// ---------------------------------------------------------------------------
describe('0074 pure: what may be removed, and what is said when it may not', () => {
	it('takes the DATABASE verdict, not a re-derivation from the counts', () => {
		// The counts say "nothing attached" and the verdict says no. The
		// verdict wins, because a second derivation is the thing that stops
		// agreeing with the first.
		expect(copyIsRemovable(copy({ removable: false, counts: counts() }))).toBe(false);
		expect(copyIsRemovable(copy({ removable: true, counts: counts({ submissions: 9 }) }))).toBe(
			true
		);
	});

	it('a removable copy has NO blocked reason, and a blocked one has a sentence', () => {
		expect(removalBlockedReason(copy({ removable: true }))).toBeNull();
		const reason = removalBlockedReason(
			copy({ removable: false, student_work: 1, counts: counts({ submissions: 1 }) })
		);
		expect(reason).toBeTruthy();
		expect(reason).toMatch(/student has work/i);
		expect(reason).toMatch(/1 hand-in/);
	});

	it('the reason NAMES which kind of work, so it is not one sentence for three cases', () => {
		const subs = removalBlockedReason(
			copy({ removable: false, counts: counts({ submissions: 2 }) })
		)!;
		const resp = removalBlockedReason(
			copy({ removable: false, counts: counts({ responses: 3 }) })
		)!;
		const appr = removalBlockedReason(
			copy({ removable: false, counts: counts({ approvals: 1 }) })
		)!;
		expect(subs).toMatch(/2 hand-ins/);
		expect(resp).toMatch(/3 saved answers/);
		expect(appr).toMatch(/1 approval/);
		expect(new Set([subs, resp, appr]).size).toBe(3);
	});

	it('falls back to a true sentence when the verdict says no and the counts say nothing', () => {
		// A blocked row whose counts do not explain why still gets a sentence
		// rather than an empty parenthesis.
		const reason = removalBlockedReason(copy({ removable: false, counts: counts() }))!;
		expect(reason).toMatch(/student work/i);
		expect(reason).not.toMatch(/\(\)/);
	});

	it('the cost names classes and every kind of attached material', () => {
		const cost = removalCost(
			copy({ counts: counts({ postings: 2, files: 1, rubrics: 1, decks: 1, instructor_keys: 1 }) })
		);
		expect(cost.join(' ')).toMatch(/2 classes/);
		expect(cost.join(' ')).toMatch(/1 attached file/);
		expect(cost.join(' ')).toMatch(/1 rubric/);
		expect(cost.join(' ')).toMatch(/1 slide deck/);
		expect(cost.join(' ')).toMatch(/1 instructor-only item/);
	});

	it('POSTINGS ARE A COST, NEVER A BLOCKER, because every item has one', () => {
		// The mistake 0061's safety query invites: _classroom_check_publish_targets
		// raises on an empty section list, so `postings > 0` is universal.
		const only = copy({ removable: true, counts: counts({ postings: 1 }) });
		expect(copyIsRemovable(only)).toBe(true);
		expect(removalCost(only)).toEqual(['listed in 1 class']);
	});

	it('singular and plural are both right, in both directions', () => {
		expect(plural(1, 'copy', 'copies')).toBe('1 copy');
		expect(plural(3, 'copy', 'copies')).toBe('3 copies');
		expect(plural(0, 'copy', 'copies')).toBe('0 copies');
	});

	it('the summary states a zero as a sentence rather than leaving a blank', () => {
		expect(summaryLine(EMPTY_ANSWER.totals)).toMatch(/No duplicate drafts/i);
		expect(summaryLine({ groups: 2, surplus: 4, removable: 4, blocked: 0 })).toMatch(
			/All of them are safe/i
		);
		expect(summaryLine({ groups: 1, surplus: 2, removable: 0, blocked: 2 })).toMatch(
			/None can be removed/i
		);
		const mixed = summaryLine({ groups: 2, surplus: 5, removable: 3, blocked: 2 });
		expect(mixed).toMatch(/3 safe to remove/);
		expect(mixed).toMatch(/2 carrying student work/);
	});

	it('NO EM DASHES anywhere in the copy this module produces', () => {
		const everything = [
			summaryLine({ groups: 2, surplus: 5, removable: 3, blocked: 2 }),
			summaryLine(EMPTY_ANSWER.totals),
			removalBlockedReason(copy({ removable: false, counts: counts({ submissions: 1 }) })) ?? '',
			...removalCost(copy({ counts: counts({ postings: 2, files: 1 }) }))
		].join(' ');
		expect(everything).not.toContain('—');
	});

	it('an announcement with no title still has a heading', () => {
		expect(groupHeading({ title: null, kind: 'post' })).toBe('Untitled announcement');
		expect(groupHeading({ title: '   ', kind: 'assignment' })).toBe('Untitled');
		expect(groupHeading({ title: 'Bridge lab', kind: 'assignment' })).toBe('Bridge lab');
		expect(kindLabel('post')).toBe('Announcement');
		expect(kindLabel('material')).toBe('Material');
	});

	it('readAnswer survives a shape it did not expect rather than throwing', () => {
		expect(readAnswer(null)).toEqual(EMPTY_ANSWER);
		expect(readAnswer('nope')).toEqual(EMPTY_ANSWER);
		expect(readAnswer({})).toEqual(EMPTY_ANSWER);
		expect(readAnswer({ groups: [group()], totals: {} }).totals.groups).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 2. The real component, server-rendered. Structure only.
// ---------------------------------------------------------------------------
describe('0074 render: the surface says what it is doing', () => {
	const remove = async () => ({ ok: true });

	it('a clean class gets a deliberate empty state, not a blank pane', () => {
		const html = strip(render(DuplicateDrafts, { props: { answer: EMPTY_ANSWER } }).body);
		expect(html).toContain('data-dd-empty');
		expect(html).toMatch(/Nothing to clean up/i);
		expect(countOf(html, COPY_ROW)).toBe(0);
		// CONTROL: the same component with groups renders rows, so the zero
		// above is the state and not a broken render.
		const withRows = strip(
			render(DuplicateDrafts, { props: { answer: answerOf([group()]) } }).body
		);
		expect(countOf(withRows, COPY_ROW)).toBe(1);
		expect(withRows).not.toContain('data-dd-empty');
	});

	it('a deployment without 0187 SAYS SO, and does not claim the class is clean', () => {
		const html = strip(
			render(DuplicateDrafts, { props: { answer: EMPTY_ANSWER, ready: false } }).body
		);
		expect(html).toContain('data-dd-unready');
		expect(html).not.toContain('data-dd-empty');
		expect(html).toMatch(/nothing is missing from your class/i);
	});

	it('AN OMITTED remove TRANSPORT REMOVES EVERY REMOVE CONTROL', () => {
		const props = { answer: answerOf([group({ surplus: [copy({ id: 'a' }), copy({ id: 'b' })] })]) };
		const readOnly = strip(render(DuplicateDrafts, { props }).body);
		const writable = strip(render(DuplicateDrafts, { props: { ...props, remove } }).body);
		// 0 arm controls against 2 on the identical fixture. Absence is the
		// mechanism, and the control is what makes the 0 mean something.
		expect(countOf(readOnly, ARM)).toBe(0);
		expect(countOf(writable, ARM)).toBe(2);
		// The rows themselves are still listed either way: read-only is not
		// blindness.
		expect(countOf(readOnly, COPY_ROW)).toBe(2);
	});

	it('a copy with student work is shown SEPARATELY, marked, and offered nothing', () => {
		const blocked = copy({
			id: 'blocked',
			removable: false,
			student_work: 1,
			counts: counts({ submissions: 1 })
		});
		const html = strip(
			render(DuplicateDrafts, {
				props: { answer: answerOf([group({ surplus: [copy({ id: 'ok' }), blocked] })]), remove }
			}).body
		);
		expect(countOf(html, BLOCKED)).toBe(1);
		expect(countOf(html, REASON)).toBe(1);
		expect(html).toMatch(/Not removable/i);
		expect(html).toMatch(/student has work/i);
		// ONE arm control for TWO rows: the safe one has it, the blocked one
		// does not, on one render.
		expect(countOf(html, ARM)).toBe(1);
		expect(countOf(html, COPY_ROW)).toBe(2);
		expect(html).toContain('data-removable="false"');
		expect(html).toContain('data-removable="true"');
	});

	it('CONTROL: make the same copy removable and the block disappears', () => {
		const g = group({
			surplus: [copy({ id: 'ok' }), copy({ id: 'was-blocked', removable: true, student_work: 0 })]
		});
		const html = strip(render(DuplicateDrafts, { props: { answer: answerOf([g]), remove } }).body);
		expect(countOf(html, BLOCKED)).toBe(0);
		expect(countOf(html, REASON)).toBe(0);
		expect(countOf(html, ARM)).toBe(2);
	});

	it('names the kept copy, its date, and how many copies there are', () => {
		const html = strip(
			render(DuplicateDrafts, { props: { answer: answerOf([group()]), remove } }).body
		);
		expect(html).toContain('data-dd-keep');
		expect(html).toMatch(/Keeping the copy written/i);
		expect(html).toContain('data-dd-copies');
		expect(html).toMatch(/2 copies/);
		expect(html).toMatch(/Bridge lab writeup/);
		expect(html).toMatch(/T\. Vargas/);
	});

	it('says a student cannot see any of this, because that is the urgency', () => {
		const html = strip(render(DuplicateDrafts, { props: { answer: EMPTY_ANSWER } }).body);
		expect(html).toMatch(/is visible to a student/i);
		expect(html).toMatch(/does not appear in any class until it is posted/i);
	});

	it('the confirm is a SECOND press: nothing is armed on first render', () => {
		const html = strip(
			render(DuplicateDrafts, { props: { answer: answerOf([group()]), remove } }).body
		);
		expect(html).not.toContain('data-dd-confirm');
		expect(html).not.toContain('data-dd-do-remove');
		expect(html).toContain('data-dd-arm');
	});

	it('THERE IS NO BULK CONTROL. A teacher writing is not a cache', () => {
		const many = answerOf([
			group({ surplus: [copy({ id: 'a' }), copy({ id: 'b' }), copy({ id: 'c' })] }),
			group({ keep_id: 'keep-2', title: 'Truss', surplus: [copy({ id: 'd' })] })
		]);
		const html = strip(render(DuplicateDrafts, { props: { answer: many, remove } }).body);
		expect(countOf(html, ARM)).toBe(4);
		expect(html).not.toMatch(/remove all/i);
		expect(html).not.toMatch(/select all/i);
		expect(html).not.toMatch(/clean up all/i);
		expect(countOf(html, /type="checkbox"/g)).toBe(0);
	});

	it('every control carries a visible word, never a glyph alone', () => {
		const html = strip(
			render(DuplicateDrafts, { props: { answer: answerOf([group()]), remove } }).body
		);
		const buttons = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
		expect(buttons.length).toBeGreaterThan(0);
		for (const b of buttons) {
			const text = b.replace(/<[^>]*>/g, '').trim();
			expect(text.length).toBeGreaterThan(2);
		}
	});
});
